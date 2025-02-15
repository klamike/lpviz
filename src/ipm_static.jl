using StaticTools
using Printf

# ----------------------------------------------------
# Helper Functions
# ----------------------------------------------------

@inline function max_step_length_scalar(x::Float64, dx::Float64)
    return (dx ≥ 0.0) ? 1.0 : (-x / dx)
end

@inline function max_step_length(x::AbstractVector{Float64}, dx::AbstractVector{Float64})
    α = 1.0
    @inbounds for i in 1:length(x)
        α = min(α, max_step_length_scalar(x[i], dx[i]))
    end
    return α
end

"""
    gauss_solve!(K, b, sol)

A simple Gaussian elimination solver with partial pivoting.
_K_ is an N×N dense matrix, _b_ is the right‐hand side (length N), and
_sol_ will be overwritten with the solution.
This routine works in place (destroying K and b).
"""
function gauss_solve!(K::AbstractMatrix{Float64}, b::AbstractVector{Float64}, sol::AbstractVector{Float64})
    N = size(K, 1)
    # Forward elimination
    for k in 1:N
        pivot = abs(K[k, k])
        pivot_idx = k
        @inbounds for i in k+1:N
            if abs(K[i, k]) > pivot
                pivot = abs(K[i, k])
                pivot_idx = i
            end
        end
        if pivot == 0.0
            @inbounds for i in 1:N
                sol[i] = 0.0
            end
            return
        end
        if pivot_idx ≠ k
            @inbounds for j in k:N
                tmp = K[k, j]
                K[k, j] = K[pivot_idx, j]
                K[pivot_idx, j] = tmp
            end
            tmp = b[k]
            b[k] = b[pivot_idx]
            b[pivot_idx] = tmp
        end
        @inbounds for i in k+1:N
            factor = K[i, k] / K[k, k]
            for j in k:N
                K[i, j] -= factor * K[k, j]
            end
            b[i] -= factor * b[k]
        end
    end
    # Back substitution
    @inbounds sol[N] = b[N] / K[N, N]
    for i in N-1:-1:1
        ssum = b[i]
        @inbounds for j in i+1:N
            ssum -= K[i, j] * sol[j]
        end
        sol[i] = ssum / K[i, i]
    end
end

@inline function copy_matrix!(dest::AbstractMatrix{Float64}, src::AbstractMatrix{Float64})
    m, n = size(src)
    @inbounds for i in 1:m
        for j in 1:n
            dest[i, j] = src[i, j]
        end
    end
end

# ----------------------------------------------------
# Interior-Point Method with Full Iteration Logging
# ----------------------------------------------------

"""
    ipm(A, b, c, w; ϵ_p, ϵ_d, ϵ_opt, nitermax, αmax, verbose)

Solves

    min c' x   subject to:  A x - s = b,   s ≥ 0

using a primal-dual interior point method with predictor-corrector steps.
The dual is: max b'y  subject to: A' y = c,   y ≥ 0.

All temporary arrays are preallocated using MallocArray for WASM compatibility.
Iterates (solution, predictor, and corrector) are logged in preallocated buffers.
"""
function ipm(A::AbstractMatrix{Float64}, b::AbstractVector{Float64},
             c::AbstractVector{Float64}, w::AbstractVector{Float64};
             ϵ_p=1e-6, ϵ_d=1e-6, ϵ_opt=1e-6, nitermax=30, αmax=0.9990, verbose=false)
    # Dimensions: m constraints, n decision variables.
    m, n = size(A)
    N = n + 2*m  # size of the KKT system

    # ---------------------------
    # Allocate Primal/Dual Variables
    # ---------------------------
    x = MallocArray{Float64}(undef, n)
    s = MallocArray{Float64}(undef, m)
    y = MallocArray{Float64}(undef, m)
    @inbounds for j in 1:n
        x[j] = 0.0
    end
    @inbounds for i in 1:m
        s[i] = 1.0
        y[i] = 1.0
    end

    # ---------------------------
    # Preallocate Temporary Buffers (for residuals, KKT system, etc.)
    # ---------------------------
    Ax   = MallocArray{Float64}(undef, m)
    rp   = MallocArray{Float64}(undef, m)   # primal residual
    Aty  = MallocArray{Float64}(undef, n)
    rd   = MallocArray{Float64}(undef, n)   # dual residual

    # KKT system buffers
    KKT       = MallocArray{Float64}(undef, N, N)
    rhs       = MallocArray{Float64}(undef, N)
    sol_vec   = MallocArray{Float64}(undef, N)
    KKT_backup = MallocArray{Float64}(undef, N, N)  # backup to restore KKT

    # Direction buffers
    Δ_aff = MallocArray{Float64}(undef, N)  # affine (predictor) direction
    Δ_cor = MallocArray{Float64}(undef, N)  # centering (corrector) direction

    # Buffers for combined step (final direction)
    combined_dx = MallocArray{Float64}(undef, n)
    combined_ds = MallocArray{Float64}(undef, m)
    combined_dy = MallocArray{Float64}(undef, m)

    # ---------------------------
    # Preallocate Logging Buffers for Iterates
    # We log:
    #   solution: x, s, y, µ  (nitermax+1 entries)
    #   predictor: δx_aff, δs_aff, δy_aff, µ_aff  (nitermax entries)
    #   corrector: δx_cor, δs_cor, δy_cor, µ  (nitermax entries)
    # ---------------------------
    max_iter = nitermax  # maximum iterations
    sol_x = MallocArray{Float64}(undef, n, max_iter+1)
    sol_s = MallocArray{Float64}(undef, m, max_iter+1)
    sol_y = MallocArray{Float64}(undef, m, max_iter+1)
    sol_mu = MallocArray{Float64}(undef, max_iter+1)

    pred_x = MallocArray{Float64}(undef, n, max_iter)
    pred_s = MallocArray{Float64}(undef, m, max_iter)
    pred_y = MallocArray{Float64}(undef, m, max_iter)
    pred_mu = MallocArray{Float64}(undef, max_iter)

    corr_x = MallocArray{Float64}(undef, n, max_iter)
    corr_s = MallocArray{Float64}(undef, m, max_iter)
    corr_y = MallocArray{Float64}(undef, m, max_iter)
    corr_mu = MallocArray{Float64}(undef, max_iter)

    # Record initial solution (iteration 0)
    @inbounds for j in 1:n
        sol_x[j, 1] = x[j]
    end
    @inbounds for i in 1:m
        sol_s[i, 1] = s[i]
        sol_y[i, 1] = y[i]
    end
    mu_init = 0.0
    @inbounds for i in 1:m
        mu_init += s[i] * y[i]
    end
    mu_init /= m
    sol_mu[1] = mu_init

    iter = 0  # iteration counter

    while iter < max_iter
        # --- Compute Residuals ---
        @inbounds for i in 1:m
            ssum = 0.0
            for j in 1:n
                ssum += A[i, j] * x[j]
            end
            Ax[i] = ssum
        end
        @inbounds for i in 1:m
            rp[i] = b[i] - Ax[i] + s[i]   # rp = b - (A*x - s)
        end
        @inbounds for j in 1:n
            ssum = 0.0
            for i in 1:m
                ssum += A[i, j] * y[i]
            end
            Aty[j] = ssum
        end
        @inbounds for j in 1:n
            rd[j] = c[j] - Aty[j]
        end

        mu = 0.0
        @inbounds for i in 1:m
            mu += s[i] * y[i]
        end
        mu /= m

        rp_norm = 0.0
        @inbounds for i in 1:m
            rp_norm = max(rp_norm, abs(rp[i]))
        end
        rd_norm = 0.0
        @inbounds for j in 1:n
            rd_norm = max(rd_norm, abs(rd[j]))
        end

        pobj = 0.0
        @inbounds for j in 1:n
            pobj += c[j] * x[j]
        end
        dobj = 0.0
        @inbounds for i in 1:m
            dobj += b[i] * y[i]
        end
        gap = abs(pobj - dobj) / (1.0 + abs(pobj))

        if verbose
            @printf("%4d  %+.6e %+.6e  %.2e %.2e  %.1e\n", iter, pobj, dobj, rp_norm, rd_norm, mu)
        end

        # Check convergence
        if rp_norm ≤ ϵ_p && rd_norm ≤ ϵ_d && gap ≤ ϵ_opt
            break
        end

        # --- Build the KKT System ---
        # Ordering: [Δx; Δs; Δy] with sizes: n, m, m.
        # Rows 1..m:    A Δx - Δs             = rp
        @inbounds for i in 1:m
            for j in 1:n
                KKT[i, j] = A[i, j]
            end
            for j in 1:m
                KKT[i, n+j] = (i == j ? -1.0 : 0.0)
            end
            for j in 1:m
                KKT[i, n+m+j] = 0.0
            end
        end
        # Rows m+1..m+n: 0*Δx + 0*Δs + A' Δy   = rd
        @inbounds for i in 1:n
            row = m + i
            for j in 1:n
                KKT[row, j] = 0.0
            end
            for j in 1:m
                KKT[row, n+j] = 0.0
            end
            for j in 1:m
                KKT[row, n+m+j] = A[j, i]
            end
        end
        # Rows m+n+1..N: 0*Δx + diag(y)*Δs + diag(s)*Δy = - s .* y  (complementarity)
        @inbounds for i in 1:m
            row = m + n + i
            for j in 1:n
                KKT[row, j] = 0.0
            end
            for j in 1:m
                KKT[row, n+j] = (i == j ? y[i] : 0.0)
            end
            for j in 1:m
                KKT[row, n+m+j] = (i == j ? s[i] : 0.0)
            end
        end

        copy_matrix!(KKT_backup, KKT)

        # --- Affine (Predictor) Step ---
        # Build rhs_aff = [rp; rd; - s .* y]
        @inbounds for i in 1:m
            rhs[i] = rp[i]
        end
        @inbounds for i in 1:n
            rhs[m+i] = rd[i]
        end
        @inbounds for i in 1:m
            rhs[m+n+i] = - s[i] * y[i]
        end

        copy_matrix!(KKT, KKT_backup)
        gauss_solve!(KKT, rhs, sol_vec)
        @inbounds for i in 1:N
            Δ_aff[i] = sol_vec[i]
        end

        # Extract predictor directions
        Δx_aff = view(Δ_aff, 1:n)
        Δs_aff = view(Δ_aff, n+1:n+m)
        Δy_aff = view(Δ_aff, n+m+1:N)
        αp_aff = max_step_length(s, Δs_aff)
        αd_aff = max_step_length(y, Δy_aff)
        mu_aff = 0.0
        @inbounds for i in 1:m
            mu_aff += (s[i] + αp_aff * Δs_aff[i]) * (y[i] + αd_aff * Δy_aff[i])
        end
        mu_aff /= m

        # Log predictor iterate
        @inbounds for j in 1:n
            pred_x[j, iter+1] = Δ_aff[j]
        end
        @inbounds for i in 1:m
            pred_s[i, iter+1] = Δ_aff[n+i]
            pred_y[i, iter+1] = Δ_aff[n+m+i]
        end
        pred_mu[iter+1] = mu_aff

        # --- Corrector Step ---
        # Build rhs_cor = [zeros(m); zeros(n); σ*mu - Δs_aff .* Δy_aff]
        σ = clamp((mu_aff/mu)^3, 1e-8, 1.0 - 1e-8)
        @inbounds for i in 1:m
            rhs[i] = 0.0
        end
        @inbounds for i in 1:n
            rhs[m+i] = 0.0
        end
        @inbounds for i in 1:m
            rhs[m+n+i] = σ * mu - (Δs_aff[i] * Δy_aff[i])
        end

        copy_matrix!(KKT, KKT_backup)
        gauss_solve!(KKT, rhs, sol_vec)
        @inbounds for i in 1:N
            Δ_cor[i] = sol_vec[i]
        end

        # Log corrector iterate
        @inbounds for j in 1:n
            corr_x[j, iter+1] = Δ_cor[j]
        end
        @inbounds for i in 1:m
            corr_s[i, iter+1] = Δ_cor[n+i]
            corr_y[i, iter+1] = Δ_cor[n+m+i]
        end
        corr_mu[iter+1] = mu

        # --- Combined Step ---
        @inbounds for j in 1:n
            combined_dx[j] = Δ_aff[j] + ((αp_aff < 0.9 || αd_aff < 0.9) ? Δ_cor[j] : 0.0)
        end
        @inbounds for i in 1:m
            combined_ds[i] = Δ_aff[n+i] + ((αp_aff < 0.9 || αd_aff < 0.9) ? Δ_cor[n+i] : 0.0)
            combined_dy[i] = Δ_aff[n+m+i] + ((αp_aff < 0.9 || αd_aff < 0.9) ? Δ_cor[n+m+i] : 0.0)
        end

        αp = αmax * max_step_length(s, combined_ds)
        αd = αmax * max_step_length(y, combined_dy)

        @inbounds for j in 1:n
            x[j] += αp * combined_dx[j]
        end
        @inbounds for i in 1:m
            s[i] += αp * combined_ds[i]
            y[i] += αd * combined_dy[i]
        end

        # Log new solution iterate at index iter+2 (since we recorded initial state at index 1)
        @inbounds for j in 1:n
            sol_x[j, iter+2] = x[j]
        end
        @inbounds for i in 1:m
            sol_s[i, iter+2] = s[i]
            sol_y[i, iter+2] = y[i]
        end
        sol_mu[iter+2] = mu

        iter += 1
    end

    # ----------------------------------------------------
    # Convert Logged Buffers to Standard Julia Structures
    # (We convert each column of our preallocated matrices into a Vector.)
    # ----------------------------------------------------
    num_sol = iter + 1   # solution iterates: from 1 to iter+1
    num_steps = iter     # predictor and corrector steps recorded from 1 to iter

    sol_x_list = Vector{Vector{Float64}}(undef, num_sol)
    sol_s_list = Vector{Vector{Float64}}(undef, num_sol)
    sol_y_list = Vector{Vector{Float64}}(undef, num_sol)
    sol_mu_list = Vector{Float64}(undef, num_sol)
    for k in 1:num_sol
        sol_x_list[k] = [sol_x[j, k] for j in 1:n]
        sol_s_list[k] = [sol_s[i, k] for i in 1:m]
        sol_y_list[k] = [sol_y[i, k] for i in 1:m]
        sol_mu_list[k] = sol_mu[k]
    end

    pred_x_list = Vector{Vector{Float64}}(undef, num_steps)
    pred_s_list = Vector{Vector{Float64}}(undef, num_steps)
    pred_y_list = Vector{Vector{Float64}}(undef, num_steps)
    pred_mu_list = Vector{Float64}(undef, num_steps)
    for k in 1:num_steps
        pred_x_list[k] = [pred_x[j, k] for j in 1:n]
        pred_s_list[k] = [pred_s[i, k] for i in 1:m]
        pred_y_list[k] = [pred_y[i, k] for i in 1:m]
        pred_mu_list[k] = pred_mu[k]
    end

    corr_x_list = Vector{Vector{Float64}}(undef, num_steps)
    corr_s_list = Vector{Vector{Float64}}(undef, num_steps)
    corr_y_list = Vector{Vector{Float64}}(undef, num_steps)
    corr_mu_list = Vector{Float64}(undef, num_steps)
    for k in 1:num_steps
        corr_x_list[k] = [corr_x[j, k] for j in 1:n]
        corr_s_list[k] = [corr_s[i, k] for i in 1:m]
        corr_y_list[k] = [corr_y[i, k] for i in 1:m]
        corr_mu_list[k] = corr_mu[k]
    end

    # Build the final dictionary mimicking the original output.
    output = Dict(
        "iterates" => Dict(
            "solution" => Dict("x" => sol_x_list, "s" => sol_s_list, "y" => sol_y_list, "µ" => sol_mu_list),
            "predictor" => Dict("x" => pred_x_list, "s" => pred_s_list, "y" => pred_y_list, "µ" => pred_mu_list),
            "corrector" => Dict("x" => corr_x_list, "s" => corr_s_list, "y" => corr_y_list, "µ" => corr_mu_list)
        )
    )

    # ----------------------------------------------------
    # Free All Manually Allocated Buffers
    # ----------------------------------------------------
    free(x); free(s); free(y)
    free(Ax); free(rp); free(Aty); free(rd)
    free(KKT); free(rhs); free(sol_vec); free(KKT_backup)
    free(Δ_aff); free(Δ_cor)
    free(combined_dx); free(combined_ds); free(combined_dy)
    free(sol_x); free(sol_s); free(sol_y); free(sol_mu)
    free(pred_x); free(pred_s); free(pred_y); free(pred_mu)
    free(corr_x); free(corr_s); free(corr_y); free(corr_mu)

    return output
end

# ----------------------------------------------------
# User-Facing Handler
# ----------------------------------------------------

"""
    ipm_handler(lines, objective, weights; ...)

Accepts input data (each `line` is a 3-element Vector{Float64}) and constructs
the problem matrices. The original problem
    min c' x  subject to:  A x ≥ b
is converted into standard form by negation:
    min (-c)' x  subject to: (-A)x ≥ (-b)
"""
function ipm_handler(lines::Vector{Vector{Float64}}, objective::Vector{Float64}, weights::Vector{Float64};
                     ϵ_p=1e-6, ϵ_d=1e-6, ϵ_opt=1e-6, nitermax=30, αmax=0.9990)
    m = length(lines)
    A = MallocArray{Float64}(undef, m, 2)
    b = MallocArray{Float64}(undef, m)
    @inbounds for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i]    = lines[i][3]
    end

    # Negate A, b, and objective
    A_neg = MallocArray{Float64}(undef, m, 2)
    b_neg = MallocArray{Float64}(undef, m)
    @inbounds for i in 1:m
        for j in 1:2
            A_neg[i, j] = -A[i, j]
        end
        b_neg[i] = -b[i]
    end
    objective_neg = similar(objective)
    @inbounds for i in 1:length(objective)
        objective_neg[i] = -objective[i]
    end

    result = ipm(A_neg, b_neg, objective_neg, weights;
                 ϵ_p=ϵ_p, ϵ_d=ϵ_d, ϵ_opt=ϵ_opt, nitermax=nitermax, αmax=αmax)

    free(A); free(b); free(A_neg); free(b_neg)
    return result
end
