using Printf

function simplex_handler(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; kwargs...)
    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i] = lines[i][3]
    end
    return simplex_solver(A, b, objective; kwargs...)
end

# max c'x s.t. Ax = b, x ≥ 0
function revised_simplex(c::Vector{Float64}, A::Matrix{Float64}, b::Vector{Float64},
    basis::Vector{Bool}; tol=1e-8, verbose=true, phase1=false)
    m, n = size(A)

    x = zeros(n)
    y = zeros(m)
    
    iterations = Vector{Vector{Float64}}(undef, 0)
    verbose && @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj"
    while true
        # Compute basis B
        B = A[:, basis]

        # Update primal variables x
        x .= 0
        x[basis] .= B \ b
        push!(iterations, (copy(x)))

        # Update dual variables y
        y = B' \ c[basis]

        verbose && @printf "%4d  %+.6e %+.6e \n" length(iterations) dot(c[basis], x[basis]) dot(c, x)

        # ⚠ Early exit for phase one. NOTE: This assumes x = [x_orig; s; t]! ⚠
        if phase1
            # Compute primal residual (accounting for sign flips due to Γ)
            # r = ΓI * (Γb - ΓAx)
            x_orig_idx = 1:n-2m
            s_idx = n-2m+1:n-m
            r = sign.(A[:, s_idx]) * (b - A[:, x_orig_idx] * x[x_orig_idx])
            if maximum(max.(0, -r)) < tol
                # Compute basis based on which x, s are zero
                basis_ = ones(Bool, n - m)
                basis_[findall([x[x_orig_idx]; r] .< tol)[x_orig_idx]] .= false
                return iterations, basis_
            end
        end

        # Pick the entering variable i₁
        z = c - A'y
        i₁ = findfirst(i -> z[i] > tol && !basis[i], 1:n)
        i₁ === nothing && break # we are done

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

    return iterations, basis
end

# max c'x s.t. Ax ≤ b
function simplex_solver(
    A::Matrix{Float64},
    b::Vector{Float64},
    c::Vector{Float64};
    tol=1e-8,
    verbose=false,
)
    m, n = size(A)

    # The problem data is given in the form
    #    max c'x s.t. Ax ≤ b

    # We wrote the simplex solver for the form
    #    max c'x s.t. Ax = b, x ≥ 0

    # To get x ≥ 0, we define x1, x2 ≥ 0 such that x = x1 - x2, x1, x2 ≥ 0:
    #    max c'(x1 - x2) s.t. A(x1 - x2) ≤ b
    #  or
    #    max c'x1 - c'x2 s.t. Ax1 - Ax2 ≤ b
    # To get Ax = b, we define s = b - Ax, s ≥ 0
    #    max c'x1 - c'x2 + 0's s.t. Ax1 - Ax2 + s = b, x1, x2, s ≥ 0

    # For phase 1, we need b ≥ 0, so we define Γ = diag(map(x -> (x < 0 ? -1.0 : 1.0), b)):
    #    max c'x1 - c'x2 s.t. ΓAx1 - ΓAx2 + Γs = Γb, x1, x2, s ≥ 0
    # we add yet another slack variable t ≥ 0 and swap out the objective:
    #    max 0'x1 - 0'x2 + 0's - 1't s.t. ΓAx1 - ΓAx2 + Γs + t = Γb, x1, x2, s ≥ 0, t ≥ 0
    # this allows us to use the initial (phase1-feasible) basis x1=0, x2=0, s=b, t=0

    γ = map(x -> (x < 0 ? -1.0 : 1.0), b)
    Γ = Diagonal(γ)

    iterations_phase1, basis = revised_simplex(
        [zeros(2n + m); -ones(m)],
        [Γ * A -Γ * A Γ * Matrix{Float64}(I, m, m) Matrix{Float64}(I, m, m)],
        Γ * b,
        # collect(2*n + m + 1 : 2*n + 2*m),
        begin
            initial_basis = zeros(Bool, 2 * n + 2 * m)
            initial_basis[2*n+m+1:2*n+2*m] .= true
            initial_basis
        end,
        tol=tol,
        verbose=verbose,
        phase1=true
    )
    iterations_phase2, _ = revised_simplex(
        vcat(c, -c, zeros(m)),
        [A -A Matrix{Float64}(I, m, m)],
        b,
        basis,
        tol=tol,
        verbose=verbose
    )
    iterations = vcat(iterations_phase1[1:end-1], iterations_phase2)
    iterations_original = [x[1:n] - x[n+1:2*n] for x in iterations] # x = x1 - x2

    return iterations_original
end
