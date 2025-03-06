function ipm(lines::Vector{Vector{Float64}}, objective::Vector{Float64};
    ϵ_p=1e-6, ϵ_d=1e-6, ϵ_opt=1e-6, maxit=30, αmax=0.9990,
)
    A, b = lines_to_Ab(lines)
    return ipm(
        -A, -b,  # flip Ax ≤ b to -Ax ≥ -b
        -objective; # flip max c'x to min -c'x
        ϵ_p=ϵ_p, ϵ_d=ϵ_d, ϵ_opt=ϵ_opt,
        maxit=maxit, αmax=αmax,
    )
end

"""
    ipm(A, b, c, w)

Solve min c'x s.t. Ax >= b

In standard form:
  min c'x s.t. Ax - s = b, s >= 0

The dual is
    max    b'y  
    s.t.   A'y = c
             y ≥ 0,

The KKT conditions are
    Ax - s      = b
            A'y = c
         s,   y ≥ 0
    yᵀs         = 0
"""
function ipm(A::Matrix{Float64}, b::Vector{Float64}, c::Vector{Float64};
    ϵ_p=1e-6, ϵ_d=1e-6, ϵ_opt=1e-6, maxit=30, αmax=0.9990, verbose=false,
)
    m, n = size(A)

    res = Dict{String,Any}(
        "iterates" => Dict{String,Any}(
            "solution" => Dict{String,Any}("x" => [], "s" => [], "y" => [], "µ" => []),
            "predictor" => Dict{String,Any}("x" => [], "s" => [], "y" => [], "µ" => []),
            "corrector" => Dict{String,Any}("x" => [], "s" => [], "y" => [], "µ" => []),
        ),
    )

    # Working memory
    x = zeros(n)
    s = ones(m)
    y = ones(m)  # dual multiplier of inequality constraints
    Δᵃ = zeros(n+m+m)  # affine-scaling (predictor)
    Δᶜ = zeros(n+m+m)  # centrality (corrector)

    # Main loop
    verbose && @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj" "pfeas" "dfeas" "mu"
    niter = 0
    converged = false
    while niter <= maxit
        # Check for convergence
        r_p = b - (A*x - s)  # primal residual
        r_d = c - A'y  # dual residual
        μ = s'y / m

        p_obj = c'x  # primal objective
        d_obj = b'y  # dual objective
        gap = abs(p_obj - d_obj) / (1 + abs(p_obj))

        # Log
        verbose && @printf "%4d  %+.6e %+.6e  %.2e %.2e  %.1e\n" niter p_obj d_obj norm(r_p, Inf) norm(r_d, Inf) μ

        # Keep track of iterates
        ipm_push!(res["iterates"]["solution"], x, s, y, μ)
    
        if norm(r_p, Inf) <= ϵ_p && norm(r_d, Inf) <= ϵ_d && gap <= ϵ_opt
            # optimal solution found!
            verbose && println("Converged to primal-dual optimal solution")
            converged = true
            break
        end

        niter += 1

        # Compute search direction
        Y = Diagonal(y)
        S = Diagonal(s)
        # Newton system
        K = [
            A           -I          zeros(m, m);
            zeros(n, n) zeros(n, m) A';
            zeros(m, n)  Y          S;
        ]

        # Affine scaling direction (predictor)
        Δᵃ .= K \ vcat(
            b - (A*x - s),
            c - A'y,
            -s .* y,
        )

        δxᵃ = Δᵃ[1:n]
        δsᵃ = Δᵃ[(n+1):(n+m)]
        δyᵃ = Δᵃ[(n+m+1):(n+m+m)]

        # Compute maximum affine step size
        αp = ipm_α(s, δsᵃ)
        αd = ipm_α(y, δyᵃ)

        μᵃ = dot(s + αp .* δsᵃ, y + αd .* δyᵃ) / m

        ipm_push!(res["iterates"]["predictor"], δxᵃ, δsᵃ, δyᵃ, μᵃ)

        # Only use centering step if affine step is short
        δx, δs, δy, αp, αd = if !(αp >= 0.9 && αd >= 0.9)
            # Centering direction (corrector)
            σ = clamp((μᵃ / μ)^3, 1e-8, 1 - 1e-8)
            
            Δᶜ .= K \ vcat(
                zeros(m),
                zeros(n),
                σ .* μ .* ones(m) - (δsᵃ .* δyᵃ),
            )

            δxᶜ = δxᵃ + Δᶜ[1:n]
            δsᶜ = δsᵃ + Δᶜ[(n+1):(n+m)]
            δyᶜ = δyᵃ + Δᶜ[(n+m+1):(n+m+m)]

            # Compute combined step and length
            ipm_push!(res["iterates"]["corrector"], δxᶜ, δsᶜ, δyᶜ, μ)
            δxᶜ, δsᶜ, δyᶜ, αmax * ipm_α(s, δsᶜ), αmax * ipm_α(y, δyᶜ)
        else
            ipm_push!(res["iterates"]["corrector"], zeros(n), zeros(m), zeros(m), μ)
            δxᵃ, δsᵃ, δyᵃ, αmax * ipm_α(s, δsᵃ), αmax * ipm_α(y, δyᵃ)
        end

        # Make step
        x .+= αp .* δx
        s .+= αp .* δs
        y .+= αd .* δy
    end

    return res
end

"""
    ipm_α(x, dx)

Compute maximum step length α so that x + α*dx ≥ 0
"""
ipm_α(x::Float64, dx::Float64) = (dx ≥ 0) ? 1.0 : (-x / dx)

ipm_α(x::AbstractVector, dx::AbstractVector) = min(1.0, minimum(ipm_α.(x, dx)))


ipm_push!(d, x, s, y, μ) = begin
    push!(d["x"], copy(x))
    push!(d["s"], copy(s))
    push!(d["y"], copy(y))
    push!(d["µ"], copy(μ))
end