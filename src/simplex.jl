using Printf

function simplex_handler(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; kwargs...)
    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i]    = lines[i][3]
    end
    return simplex_solver(A, b, objective; kwargs...)
end

# max c'x s.t. Ax = b, x ≥ 0
@inline function revised_simplex(c::Vector{Float64}, A::Matrix{Float64}, b::Vector{Float64},
                         basis::Vector{Int}; tol=1e-8, verbose=true, phase1=false)
    m, n = size(A)
    x = zeros(n)

    verbose && @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj"
    
    iterations = Vector{Vector{Float64}}(undef, 0)
    while true
        B = A[:, basis]
        B⁻¹ = inv(B)
        
        x_B = B⁻¹ * b
        x .= 0.0
        for i in 1:m
            x[basis[i]] = x_B[i]
        end
        push!(iterations, (copy(x)))
        y = c[basis]' * B⁻¹

        verbose && @printf "%4d  %+.6e %+.6e \n" length(iterations) dot(c[basis], x_B) dot(c, x)

        # ⚠ Early exit for phase 1. This assumes x = [x_; s; t]! ⚠
        if phase1
            # Compute residual (accounting for sign flips due to Γ)
            residual = sign.(A[:, n-2m+1:n-m]) * (A[:, 1:n-2m] * x[1:n-2m] - b)
            if maximum(max.(0, residual)) < tol
                basis_set = Set(collect(1:n-m))
                for i in 1:m
                    # Remove slack if residual is non-negative
                    (length(basis_set) == m) && break
                    (-residual[i] < tol) && delete!(basis_set, n-2m+i)
                end
                for i in 1:n
                    # Remove variable if value is zero
                    (length(basis_set) == m) && break
                    (x[i] < tol) && delete!(basis_set, i)
                end
                push!(iterations, x) # this will never be accessed

                return iterations, collect(basis_set)
            end
        end

        entering = nothing
        max_reduced = -Inf
        for j in 1:n
            j in basis && continue

            r = c[j] - dot(y, A[:, j])
            if r > max_reduced + tol
                max_reduced = r
                entering = j
            end
        end

        (max_reduced <= tol || entering === nothing) && break
        
        d = B⁻¹ * A[:, entering]
        
        theta = Inf
        leaving_index = nothing
        for i in 1:m
            if d[i] > tol
                ratio = x_B[i] / d[i]
                if ratio < theta
                    theta = ratio
                    leaving_index = i
                end
            end
        end

        leaving_index === nothing && error("LP is unbounded")

        basis[leaving_index] = entering
    end
    
    return iterations, basis
end

# max c'x s.t. Ax ≤ b
@inline function simplex_solver(
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
        [zeros(2n+m); -ones(m)],
        [Γ*A -Γ*A Γ*Matrix{Float64}(I, m, m) Matrix{Float64}(I, m, m)],
        Γ*b,
        collect(2*n + m + 1 : 2*n + 2*m),
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
