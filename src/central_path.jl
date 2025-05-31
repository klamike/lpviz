function central_path(vertices::Vector{Vector{Float64}}, lines::Vector{Vector{Float64}}, objective::Vector{Float64}; niter=nothing, weights=nothing, verbose=false)
    niter > 2^10 && throw(ArgumentError("niter > 2^10 not allowed"))

    lines, weights = central_path_filter(lines, weights)
    m = length(lines)
    
    A, b = lines_to_Ab(lines)

    µ = central_path_μ(niter)
    w = central_path_w(weights, m)

    central_path = Vector{Vector{Float64}}()
    logs = String[]
    log = @sprintf "  %4s %6s %6s  %8s  %7s  \n" "Iter" "x" "y" "PObj" "µ"
    verbose && print(log)
    push!(logs, log)

    x0 = centroid(vertices)

    tsolve = @elapsed for µₖ in µ
        xₖ = central_path_xₖ(A, b, objective, w, µₖ, x0, verbose=verbose)
        if !isnothing(xₖ)
            push!(central_path, xₖ)
            log = @sprintf "  %-4d %+6.2f %+6.2f  %+.1e  %.1e  \n" length(central_path) xₖ[1] xₖ[2] dot(objective, xₖ) µₖ
            verbose && print(log)
            push!(logs, log)
        end
    end
    return Dict{String, Union{Vector, Float64}}("central_path" => central_path, "logs" => logs, "tsolve" => tsolve)
end

function central_path_xₖ(A, b, c, w, µ, x0; maxit=2000, ϵ=1e-4, verbose=false)
    # use newton's method to solve the central path problem, using the centroid as the initial point
    m, n = size(A)
    @assert w == ones(m) "w must be ones"
    x = x0

    function f(x)
        r = b - A * x
        if any(r .<= 0)
            return -Inf  # outside domain
        end
        return dot(c, x) + μ * sum(log.(r))
    end

    for k in 1:maxit
        r = b - A * x
        if any(r .<= 0)
            error("Infeasible point encountered at iteration $k")
        end

        inv_r = 1.0 ./ r
        inv_r2 = inv_r .^ 2

        grad = c - μ * A' * inv_r
        hess = μ * A' * Diagonal(inv_r2) * A

        # Newton step
        dx = hess \ grad

        # Line search to stay in domain
        α = 1.0
        while any((b - A * (x + α * dx)) .<= 0)
            α *= 0.5
            if α < 1e-10
                error("Step size too small at iteration $k")
            end
        end

        # Backtracking line search for sufficient increase
        t = 0.5
        β = 0.01
        while f(x + α * dx) < f(x) + β * α * dot(grad, dx)
            α *= t
        end

        x += α * dx

        if norm(grad, Inf) < ϵ
            verbose && println("Converged in $k iterations with μ = $μ")
            return x
        end

        verbose && @printf("Iter %d: f(x) = %.6f, ‖grad‖_∞ = %.2e, α = %.2f\n", k, f(x), norm(grad, Inf), α)
    end

    # error("Did not converge after $maxit iterations")
    return nothing
end

central_path_filter(lines, weights) = begin
    length(lines) != length(weights) && error("Length of lines and weights must match")
    kept = [i for i in 1:length(lines) if weights[i] != 0]
    
    [lines[i] for i in kept], [weights[i] for i in kept]
end
central_path_μ(n) = 10.0 .^ range(3, stop=-5, length=n)
central_path_w(w, m) = isnothing(w) ? ones(m) : w