function simplex(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; tol=1e-6, verbose=true, dual=true)
    A, b = lines_to_Ab(lines)
    c = objective
    m, n = size(A)

    # The problem data is given in the form
    #    max c'x s.t. Ax ≤ b

    # We wrote the simplex solver for the form
    #    max c'x s.t. Ax = b, x ≥ 0

    # To get x ≥ 0, we define x1, x2 ≥ 0 such that x = x1 - x2, x1, x2 ≥ 0:
    #    max c'(x1 - x2) s.t. A(x1 - x2) ≤ b, x1, x2 ≥ 0
    #  or
    #    max c'x1 - c'x2 s.t. Ax1 - Ax2 ≤ b, x1, x2 ≥ 0
    # To get Ax = b, we add slack variables s ≥ 0
    #    max c'x1 - c'x2 + 0's s.t. Ax1 - Ax2 + s = b, x1, x2, s ≥ 0

    # For phase 1, we need b ≥ 0, so we define Γ = diag(map(x -> (x < 0 ? -1.0 : 1.0), b)):
    #    max c'x1 - c'x2 + 0's s.t. ΓAx1 - ΓAx2 + Γs = Γb, x1, x2, s ≥ 0
    # we add yet another slack variable t ≥ 0 and swap out the objective:
    #    max 0'x1 - 0'x2 + 0's - 1't s.t. ΓAx1 - ΓAx2 + Γs + t = Γb, x1, x2, s ≥ 0, t ≥ 0
    # this allows us to use the initial (phase1-feasible) basis x1=0, x2=0, s=0, t=Γb
    if dual
        γ = map(x -> (x < 0 ? -1.0 : 1.0), c)
        Γ = Diagonal(γ)

        verbose && @printf "Phase One\n"
        iterations_phase1, basis, logs_phase1 = simplex(
            [zeros(m); -ones(n)],
            [Γ*(A') Matrix{Float64}(I, n, n)],
            Γ*c,
            [zeros(Bool, m); ones(Bool, n)],
            tol=tol,
            verbose=verbose,
            dual=true, phase1=true, phase1_origc=b
        )

        verbose && @printf "Phase Two\n"
        iterations_phase2, _, logs_phase2 = simplex(
            -b,
            Matrix{Float64}(A'),
            c,
            basis[1:m],
            tol=tol,
            verbose=verbose,
            dual=true
        )
        
        iterations = vcat(iterations_phase1[1:end-1], iterations_phase2)
        return iterations, [logs_phase1, logs_phase2]
    else
        γ = map(x -> (x < 0 ? -1.0 : 1.0), b)
        Γ = Diagonal(γ)

        verbose && @printf "Phase One\n"
        iterations_phase1, basis, logs_phase1 = simplex(
            [zeros(2n + m); -ones(m)],
            [Γ*A -Γ*A Γ*Matrix{Float64}(I, m, m) Matrix{Float64}(I, m, m)],
            Γ*b,
            begin
                initial_basis = zeros(Bool, 2 * n + 2 * m)
                initial_basis[2*n+m+1:2*n+2*m] .= true
                initial_basis
            end,
            tol=tol,
            verbose=verbose,
            phase1=true, phase1_origc=vcat(c, -c, zeros(m))
        )

        verbose && @printf "Phase Two\n"
        iterations_phase2, _, logs_phase2 = simplex(
            vcat(c, -c, zeros(m)),
            [A -A Matrix{Float64}(I, m, m)],
            b,
            basis,
            tol=tol,
            verbose=verbose
        )
        iterations = vcat(iterations_phase1[1:end-1], iterations_phase2)
        iterations_original = [x[1:n] - x[n+1:2*n] for x in iterations] # x = x1 - x2

        return iterations_original, [logs_phase1, logs_phase2]
    end
end

# max c'x s.t. Ax = b, x ≥ 0
function simplex(c::Vector{Float64}, A::Matrix{Float64}, b::Vector{Float64},
    basis::Vector{Bool}; tol=1e-6, verbose=false,
    phase1=false, phase1_origc=nothing, # for primal simplex phase 1
    dual=false # for dual simplex
    )
    m, n = size(A)

    x = zeros(n)
    y = zeros(m)
    logs = []
    
    iterations = Vector{Vector{Float64}}(undef, 0)
    padding = repeat(" ", max(0, length(basis) - length("basis")))
    iterpadding = repeat(" ", max(0, length("basis") - length(basis)))
    log = @sprintf "%4s %6s %6s  %8s  %s\n" "Iter" "x" "y" (dual ? "DObj" : "PObj") ("basis" * padding)
    verbose && print(log)
    push!(logs, log)

    iteration = 0
    while true
        # Compute basis B
        B = A[:, basis]

        # Update primal variables x
        x .= 0
        x[basis] .= B \ b

        # Update dual variables y
        y = B' \ c[basis]

        ## Logging
        iteration += 1
        x_orig, log = if dual
            x_orig_ = y[1:2]
            x_orig_, @sprintf "%-4d %+6.2f %+6.2f  %+.1e  %s\n" iteration -x_orig_[1] -x_orig_[2] -c'x join(convert(Vector{Int}, basis)) * iterpadding
        else
            x_orig_ = x[1:2] - x[3:4] # recover original variables ⚠ Assumes x = [x₁, x₂; s]! ⚠
            x_orig_, @sprintf "%-4d %+6.2f %+6.2f  %+.1e  %s\n" iteration x_orig_[1] x_orig_[2] c'x join(convert(Vector{Int}, basis)) * iterpadding
        end
        verbose && print(log)
        push!(logs, log)
        push!(iterations, (dual ? copy(-y) : copy(x)))
        
        # ⚠ Early exit for phase one. NOTE: This assumes x = [x₁, x₂; s; t]! ⚠
        if phase1
            # Compute primal residual (accounting for sign flips due to Γ)
            # r = ΓI * (ΓAx - Γb)
            # s = -r ≥ 0
            i_x = 1:n-2m
            i_s = n-2m+1:n-m
            r = A[:, i_s] * (A[:, i_x] * x[i_x] - b)
            if maximum(max.(0, r)) < tol
                # Compute basis based on which x, s are zero
                basis_ = ones(Bool, n - m)
                basis_[findall([x[i_x]; -r] .< tol)] .= false

                # Check that this is a corner in the original problem
                log = @sprintf "%-4s %+6.2f %+6.2f  %+.1e  %s\n" string(iteration) * "e" x_orig[1] x_orig[2] phase1_origc'x[1:n-m] join(convert(Vector{Int}, basis_)) * repeat(" ", m)
                verbose && print(log)
                push!(logs, log)
                push!(iterations, (dual ? copy(-y) : copy(x)))
                if sum(-r .< tol) == (n-2m) / 2
                    basis = basis_
                    break
                end
            end
        end

        # Pick the entering variable i₁
        z = c - A'y
        valid = filter(i -> z[i] > tol && !basis[i], 1:n)
        i₁ = isempty(valid) ? (break) : valid[argmax(z[valid])]

        # Pick the exiting variable i₀
        δ = B \ A[:, i₁]
        i₀ = findfirst(
            ==(argmin([δ[j] > tol ? x[basis][j] / δ[j] : Inf for j in 1:m])),
            cumsum(basis)
        )
        i₀ === nothing && error("LP is unbounded")

        # Update the basis
        basis[i₁] = true
        basis[i₀] = false
    end

    if phase1
        # Remove the artificial variables from the basis
        basis = basis[1:n-m]
    end

    log = @sprintf "Phase %d terminated with basis %s\n" phase1 ? 1 : 2 join(convert(Vector{Int}, basis))
    verbose && print(log)
    push!(logs, log)

    return iterations, basis, logs
end
