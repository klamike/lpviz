function pdhg(lines::Vector{Vector{Float64}}, objective::Vector{Float64};
    maxit=1000, η=0.25, τ=0.25, verbose=false, tol=1e-4 # NOTE: relaxed default tolerance for PDHG
)
    # We are given A, b, c for:
    #   max cᵀx
    #   s.t. Ax ≤ b,  x unrestricted
    #
    # but the PDHG solver is written for:
    #   min cᵀx
    #   s.t. Ax = b, x ≥ 0
    #
    # Step 1: Flip the objective (max cᵀx → min -cᵀx).
    # Step 2: Convert Ax ≤ b into Ax + s = b by adding slack variable s ≥ 0.
    # Step 3: Split unrestricted x into x₊, x₋ ≥ 0 so x = x₊ - x₋.
    #
    # Thus we reformulate to:
    #   min ĉᵀχ
    #   s.t. Âχ = b, χ ≥ 0
    # with:
    #   Â = [ A   -A   I ]
    #   ĉ = [ -c;  c ; 0 ]
    #   χ = [ x₊;  x₋; s ]
    
    A, b = lines_to_Ab(lines)
    c = objective
    m, n = size(A)

    Â = [A -A Matrix{Float64}(I, m, m)]
    ĉ = vcat(-c, c, zeros(m))

    iterates = pdhg(Â, b, ĉ, maxit=maxit, η=η, τ=τ, tol=tol, verbose=verbose)

    # Extract iterates x = x₊ - x₋
    return [χₖ[1:n] - χₖ[n+1:2n] for χₖ in iterates]
end

function pdhg(A, b, c; maxit=1000, η=0.25, τ=0.25, tol=1e-4, verbose=false)
    m, n = size(A)
    xₖ, yₖ, k = zeros(n), zeros(m), 1

    iterates = []
    while (k < maxit) && (pdhg_ϵ(A, b, c, xₖ, yₖ) > tol)
        push!(iterates, copy(xₖ))
        verbose && @printf "%4d  %+.6e  opt %+.6e\n" k dot(c, xₖ) ϵ
        
        # Update x: xₖ₊₁ = Π₊(xₖ - η (c + Aᵀyₖ))
        xₖ₊₁ = xₖ - η * (c + A'yₖ)
        project_nonnegative!(xₖ₊₁)  # Apply Π₊(⋅) projection
        Δx = xₖ₊₁ - xₖ

        # Update y: yₖ₊₁ = yₖ + τ (A(2xₖ₊₁ - xₖ) - b)
        Δy = τ * A * (2xₖ₊₁ - xₖ) - τ * b

        xₖ += Δx
        yₖ += Δy
        k += 1
    end

    verbose && @printf "%4d  %+.6e  opt %+.6e\n" k dot(c, xₖ) ϵ

    return iterates
end

function pdhg_ϵ(A, b, c, xₖ, yₖ)
    # Computes optimality tolerance:
    # 1. Primal feasibility: ||Ax - b|| / (1 + ||b||)
    # 2. Dual feasibility: ||Π₊(-Aᵀy - c)|| / (1 + ||c||)
    # 3. Duality gap: ||cᵀx + bᵀy|| / (1 + |cᵀx| + |bᵀy|)
    return (
        LinearAlgebra.norm(A * xₖ - b, 2) / (1 + LinearAlgebra.norm(b, 2))
        + LinearAlgebra.norm(project_nonnegative(-A'yₖ - c), 2) / (1 + LinearAlgebra.norm(c, 2))
        + LinearAlgebra.norm(c'xₖ + b'yₖ, 2) / (1 + abs(c'xₖ) + abs(b'yₖ))
    )
end

function project_nonnegative!(x)
    # Projection Π₊(x) = max(0, x)
    x .= max.(0.0, x)
end

function project_nonnegative(x)
    # Returns Π₊(x) without modifying x in place.
    return max.(0.0, x)
end
