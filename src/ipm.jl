using LinearAlgebra
using Printf

struct IPMData
    A::Matrix{Float64}
    b::Vector{Float64}
    c::Vector{Float64}
    w::Vector{Float64}
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
    A_ = hcat(A, -I)  # to be in standard form

    # Initial point
    x = zeros(n)
    s = ones(m)
    y = ones(m)  # dual multiplier of inequality constraints

    # Main loop
    @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj" "pfeas" "dfeas" "mu"
    niter = 0
    converged = false
    while niter <= nitermax
        # Check for convergence
        rp = b - (A*x - s)
        rd = c - A'y
        μ  = dot(s, y) / m
        # @info "residuals" 
        # @show rp
        # @show rd

        pobj = dot(c, x)
        dobj = dot(b, y)
        gap  = abs(pobj - dobj) / (1 + abs(pobj))

        # Log
        @printf "%4d  %+.6e %+.6e  %.2e %.2e  %.1e\n" niter pobj dobj norm(rp, Inf) norm(rd, Inf) μ
    
        if norm(rp, Inf) <= ϵ_p && norm(rd, Inf) <= ϵ_d && gap <= ϵ_opt
            # optimal solution found!
            converged = true
            break
        elseif niter > nitermax
            converged = false
            break
        end

        niter += 1

        # Compute search direction
        Y = Diagonal(y)
        S = Diagonal(s)
        K = [
            A           -I          zeros(m, m);
            zeros(n, n) zeros(n, m) A';
            zeros(m, n)  Y          S;
        ]

        ξa = vcat(
            b - (A*x - s),
            c - A'y,
            -s .* y,
        )

        # Affine scaling direction
        Δa = K \ ξa
        δa_x = Δa[1:n]
        δa_s = Δa[(n+1):(n+m)]
        δa_y = Δa[(n+m+1):(n+m+m)]
        αa_p = max_step_length(s, δa_s)
        αa_d = max_step_length(y, δa_y)
        # @info "Affine steps" αa_p αa_d

        if αa_p >= 0.9 && αa_d >= 0.9
            α_p = αmax * αa_p
            α_d = αmax * αa_d
    
            # Make step
            x .+= α_p .* δa_x
            s .+= α_p .* δa_s
            y .+= α_d .* δa_y

            continue
        end

        # Centering direction
        μaff = dot(s + αa_p .* δa_s, y + αa_d .* δa_y) / m
        σ = clamp((μaff / μ)^3, 1e-8, 1 - 1e-8)
        ξc = vcat(
            b - (A*x - s),
            c - A'y,
            σ .* μ .* ones(m) - δa_s .* δa_y #- s .* y,
        )
        Δc = K \ ξc
        δc_x = δa_x + Δc[1:n]
        δc_s = δa_s + Δc[(n+1):(n+m)]
        δc_y = δa_y + Δc[(n+m+1):(n+m+m)]
        αc_p = max_step_length(s, δc_s)
        αc_d = max_step_length(y, δc_y)
        # @info "Corrected" αc_p αc_d

        α_p = αmax * αc_p
        α_d = αmax * αc_d

        # Make step
        x .+= α_p .* δc_x
        s .+= α_p .* δc_s
        y .+= α_d .* δc_y
    end

    return x, s, y
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
    c = 0 .* [-2.0, -1.0]
    m, n = size(A)
    w = ones(m)

    ipm(A, b, c, w; kwargs...)
end