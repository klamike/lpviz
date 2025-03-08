function pdhg(lines::Vector{Vector{Float64}}, objective::Vector{Float64};
    ineq=false, maxit=1000, η=0.25, τ=0.25, verbose=false, tol=1e-4 # NOTE: relaxed default tolerance for PDHG
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

    iterates, logs = if ineq
        pdhg_ineq(A, b, -c, maxit=maxit, η=η, τ=τ, tol=tol, verbose=verbose)
    else
        Â = [A -A Matrix{Float64}(I, m, m)]
        ĉ = vcat(-c, c, zeros(m))
    
        iterates_, logs = pdhg(Â, b, ĉ, maxit=maxit, η=η, τ=τ, tol=tol, verbose=verbose)
        
        # Extract iterates x = x₊ - x₋
        [χₖ[1:n] - χₖ[n+1:2n] for χₖ in iterates_], logs
    end

    return iterates, logs
end

function pdhg(A, b, c; maxit=1000, η=0.25, τ=0.25, tol=1e-4, verbose=false)
    m, n = size(A)
    xₖ, yₖ, k = zeros(n), zeros(m), 1
    ϵₖ = pdhg_ϵ(A, b, c, xₖ, yₖ)
    
    logs = []
    log = @sprintf "%4s %6s %6s  %8s %8s  %7s %7s  %7s\n" "Iter" "x" "y" "PObj" "DObj" "PFeas" "DFeas" "ϵ"
    verbose && print(log)
    push!(logs, log)

    iterates = []
    tsolve = @elapsed while (k < maxit) && (ϵₖ > tol)
        push!(iterates, copy(xₖ))
        log = @sprintf "%-4d %+6.2f %+6.2f  %+.1e %+.1e  %.1e %.1e  %.1e\n" length(iterates) xₖ[1]-xₖ[3] xₖ[2]-xₖ[4] c'xₖ b'yₖ norm(A*xₖ-b, Inf) norm(pdhg_Π₊(-c - A'yₖ), Inf) ϵₖ
        verbose && print(log)
        push!(logs, log)
        
        # Update x: xₖ₊₁ = Π₊(xₖ - η (c + Aᵀyₖ))
        xₖ₊₁ = xₖ - η * (c + A'yₖ)
        pdhg_Π₊!(xₖ₊₁)  # Apply Π₊(⋅) projection
        Δx = xₖ₊₁ - xₖ

        # Update y: yₖ₊₁ = yₖ + τ (A(2xₖ₊₁ - xₖ) - b)
        Δy = τ * A * (2xₖ₊₁ - xₖ) - τ * b

        xₖ += Δx
        yₖ += Δy
        k += 1

        ϵₖ = pdhg_ϵ(A, b, c, xₖ, yₖ)
    end

    log = if ϵₖ ≤ tol
        "Converged to primal-dual optimal solution in $(tsolve)ms\n"
    else
        "Did not converge after $(length(iterates)-1) iterations in $(tsolve)ms\n"
    end
    verbose && print(log)
    push!(logs, log)

    return iterates, logs
end

function pdhg_ineq(A, b, c; maxit=1000, η=0.25, τ=0.25, tol=1e-4, verbose=false)
    m, n = size(A)
    xₖ, yₖ, k = zeros(n), ones(m), 1
    ϵₖ = pdhg_ineq_ϵ(A, b, c, xₖ, yₖ)
    
    logs = []
    log = @sprintf "%4s %6s %6s  %8s %8s  %7s %7s  %7s\n" "Iter" "x" "y" "PObj" "DObj" "PFeas" "DFeas" "ϵ"
    verbose && print(log)
    push!(logs, log)

    iterates = []
    tsolve = @elapsed while (k ≤ maxit) && (ϵₖ > tol)
        push!(iterates, copy(xₖ))
        log = @sprintf "%-4d %+6.2f %+6.2f  %+.1e %+.1e  %.1e %.1e  %.1e\n" length(iterates) xₖ[1] xₖ[2] c'xₖ -b'yₖ norm(pdhg_Π₊(A*xₖ - b), Inf) norm(pdhg_Π₊(-yₖ), Inf) ϵₖ
        verbose && print(log)
        push!(logs, log)
        
        # Update y: yₖ₊₁ = Π₊(yₖ + τ (Axₖ - b))
        yₖ₊₁ = yₖ + τ * (A * xₖ - b)
        pdhg_Π₊!(yₖ₊₁)
        Δy = yₖ₊₁ - yₖ
        
        # Update x: xₖ₊₁ = xₖ - η (c + Aᵀ(2yₖ₊₁-yₖ))
        xₖ₊₁ = xₖ - η * (c + A' * (2*yₖ₊₁ - yₖ))
        Δx = xₖ₊₁ - xₖ

        xₖ += Δx
        yₖ += Δy
        k += 1

        ϵₖ = pdhg_ineq_ϵ(A, b, c, xₖ, yₖ)
    end

    tsolve *= 1000 # convert to milliseconds
    tsolve = round(tsolve, digits=2)
    log = if ϵₖ ≤ tol
        "Converged to primal-dual optimal solution in $(tsolve)ms\n"
    else
        "Did not converge after $(length(iterates)) iterations in $(tsolve)ms\n"
    end
    verbose && print(log)
    push!(logs, log)

    return iterates, logs
end

pdhg_ϵ(A, b, c, xₖ, yₖ) = begin
    # Computes optimality tolerance:
    # 1. Primal feasibility: ||Ax - b|| / (1 + ||b||)
    # 2. Dual feasibility: ||Π₊(-Aᵀy - c)|| / (1 + ||c||)
    # 3. Duality gap: ||cᵀx + bᵀy|| / (1 + |cᵀx| + |bᵀy|)
    (
        LinearAlgebra.norm(A * xₖ - b, 2) / (1 + LinearAlgebra.norm(b, 2))
        + LinearAlgebra.norm(pdhg_Π₊(-A'yₖ - c), 2) / (1 + LinearAlgebra.norm(c, 2))
        + LinearAlgebra.norm(c'xₖ + b'yₖ, 2) / (1 + abs(c'xₖ) + abs(b'yₖ))
    )
end

pdhg_ineq_ϵ(A, b, c, xₖ, yₖ) = begin
    # Computes optimality tolerance:
    # 1. Primal feasibility: ||Π₊(Ax - b)|| / (1 + ||b||)
    # 2. Dual feasibility: ||Π₊(-y)|| / (1 + ||c||)
    # 3. Duality gap: ||cᵀx + bᵀy|| / (1 + |cᵀx| + |bᵀy|)
    (
        LinearAlgebra.norm(pdhg_Π₊(A * xₖ - b), 2) / (1 + LinearAlgebra.norm(b, 2))
        + LinearAlgebra.norm(pdhg_Π₊(-yₖ), 2) / (1 + LinearAlgebra.norm(c, 2))
        + abs(b'yₖ + c'xₖ) / (1 + abs(c'xₖ) + abs(b'yₖ))
    )
end

pdhg_Π₊!(x) = begin
    # Projection Π₊(x) = max(0, x)
    x .= max.(0.0, x)
end

pdhg_Π₊(x) = begin
    # Returns Π₊(x) without modifying x in place.
    max.(0.0, x)
end
