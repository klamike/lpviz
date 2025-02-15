using LinearAlgebra
using Printf


function ipm_handler(req::HTTP.Request)
    data = req.body
    lines = data["lines"]
    objective = data["objective"]
    weights = get(data, "weights", nothing)
    ϵ_p = get(data, "ϵ_p", 1e-6)
    ϵ_d = get(data, "ϵ_d", 1e-6)
    ϵ_opt = get(data, "ϵ_opt", 1e-6)
    nitermax = get(data, "nitermax", 30)
    αmax = get(data, "αmax", 0.9990)

    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i] = lines[i][3]
    end

    return ipm(
        -A, -b, -objective, weights;
        ϵ_p=ϵ_p, ϵ_d=ϵ_d, ϵ_opt=ϵ_opt,
        nitermax=nitermax, αmax=αmax,
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
function ipm(A, b, c, w;
    ϵ_p=1e-6,
    ϵ_d=1e-6,
    ϵ_opt=1e-6,
    nitermax=30,
    αmax=0.9990,
)
    m, n = size(A)

    res = Dict{String,Any}(
        "iterates" => Dict{String,Any}(
            "solution" => Dict{String,Any}(
                "x" => [],
                "s" => [],
                "y" => [],
                "µ" => [],
            ),
            "predictor" => Dict{String,Any}(
                "x" => [],
                "s" => [],
                "y" => [],
                "µ" => [],
            ),
            "corrector" => Dict{String,Any}(
                "x" => [],
                "s" => [],
                "y" => [],
                "µ" => [],
            ),
        ),
    )

    # Working memory
    x = zeros(n)
    s = ones(m)
    y = ones(m)  # dual multiplier of inequality constraints
    Δ_aff = zeros(n+m+m)  # affine-scaling (predictor)
    Δ_cor = zeros(n+m+m)  # centrality (corrector)

    # Main loop
    @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj" "pfeas" "dfeas" "mu"
    niter = 0
    converged = false
    while niter <= nitermax
        # Check for convergence
        rp = b - (A*x - s)
        rd = c - A'y
        μ  = dot(s, y) / m

        pobj = dot(c, x)
        dobj = dot(b, y)
        gap  = abs(pobj - dobj) / (1 + abs(pobj))

        # Log
        @printf "%4d  %+.6e %+.6e  %.2e %.2e  %.1e\n" niter pobj dobj norm(rp, Inf) norm(rd, Inf) μ

        # Keep track of iterates
        push!(res["iterates"]["solution"]["x"], copy(x))
        push!(res["iterates"]["solution"]["s"], copy(s))
        push!(res["iterates"]["solution"]["y"], copy(y))
        push!(res["iterates"]["solution"]["µ"], copy(μ))
    
        if norm(rp, Inf) <= ϵ_p && norm(rd, Inf) <= ϵ_d && gap <= ϵ_opt
            # optimal solution found!
            println("Converged to primal-dual optimal solution")
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
        ξa = vcat(
            b - (A*x - s),
            c - A'y,
            -s .* y,
        )
        Δ_aff .= K \ ξa
        δx_aff = Δ_aff[1:n]
        δs_aff = Δ_aff[(n+1):(n+m)]
        δy_aff = Δ_aff[(n+m+1):(n+m+m)]
        αp_aff = max_step_length(s, δs_aff)
        αd_aff = max_step_length(y, δy_aff)

        # Centering direction (corrector)
        # Note: always computed, even if we end up discarding it
        μaff = dot(s + αp_aff .* δs_aff, y + αd_aff .* δy_aff) / m
        σ = clamp((μaff / μ)^3, 1e-8, 1 - 1e-8)
        ξc = vcat(
            zeros(m),
            zeros(n),
            σ .* μ .* ones(m) - (δs_aff .* δy_aff),
        )
        Δ_cor .= K \ ξc
        δx_cor = Δ_cor[1:n]
        δs_cor = Δ_cor[(n+1):(n+m)]
        δy_cor = Δ_cor[(n+m+1):(n+m+m)]

        # Compute combined step length
        αp_cor = max_step_length(s, δs_aff + δs_cor)
        αd_cor = max_step_length(y, δy_aff + δy_cor)

        # Compute final step length
        # Skip correction if affine-scaling direction is good enough
        γcor = !(αp_aff >= 0.9 && αd_aff >= 0.9)
        αp = αmax * (γcor ? αp_cor : αp_aff)
        αd = αmax * (γcor ? αp_cor : αd_aff)

        # Make step
        x .+= αp .* (δx_aff .+ (γcor .* δx_cor))
        s .+= αp .* (δs_aff .+ (γcor .* δs_cor))
        y .+= αd .* (δy_aff .+ (γcor .* δy_cor))

        # Keep track of predictor/corrector directions
        push!(res["iterates"]["predictor"]["x"], copy(δx_aff))
        push!(res["iterates"]["predictor"]["s"], copy(δs_aff))
        push!(res["iterates"]["predictor"]["y"], copy(δy_aff))
        push!(res["iterates"]["predictor"]["µ"], copy(μaff))

        push!(res["iterates"]["corrector"]["x"], copy(δx_cor))
        push!(res["iterates"]["corrector"]["s"], copy(δs_cor))
        push!(res["iterates"]["corrector"]["y"], copy(δy_cor))
        push!(res["iterates"]["corrector"]["µ"], copy(μ))
    end

    return res
end

"""
    max_step_length(x, dx)

Compute maximum step length α so that x + α*dx ≥ 0
"""
max_step_length(x::Float64, dx::Float64) = (dx ≥ 0) ? 1.0 : (-x / dx)

function max_step_length(x::AbstractVector, dx::AbstractVector)
    return min(1.0, minimum(max_step_length.(x, dx)))
end

function test_ipm(; kwargs...)
    A = [
         1.0 -1.0;
        -2.0  1.0;
        -1.0 -2.0;
         1.0  0.0;
         0.0  1.0;
    ]
    b = [-2.0, -4.0, -7.0, 0.0, 0.0]
    c = [-2.0, -1.0]
    m, n = size(A)
    w = ones(m)

    ipm(A, b, c, w; kwargs...)
end