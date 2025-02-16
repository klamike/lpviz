# based on https://github.com/Shuvomoy/SimplePDHG.jl/

function pdhg_handler(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; maxit=100000, η=nothing, τ=nothing)
    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i] = lines[i][3]
    end
    return solve_pdhg(A, b, objective, maxit=maxit, η=η, τ=τ)
end


struct PDHGProblem
    c; A; b; m; n;
end

mutable struct PDHGState
    x; y; η; τ; k
end

function PDHGState(problem, η, τ)
    m, n = problem.m, problem.n
    x₀, y₀ = zeros(n), zeros(m)
    return PDHGState(x₀, y₀, η, τ, 1)
end

function project_nonnegative!(x)
    for i in eachindex(x)
        x[i] = max(0.0, x[i])
    end
end

function project_nonnegative(x)
    y = zeros(length(x))
    for i in eachindex(x)
        y[i] = max(0.0, x[i])
    end
    return y
end

function tolerance_LP(problem::PDHGProblem, state::PDHGState)
    A, b, c = problem.A, problem.b, problem.c
    x, y = state.x, state.y
    return (
        LinearAlgebra.norm(A * x - b, 2) / (1 + LinearAlgebra.norm(b, 2))
        + LinearAlgebra.norm(project_nonnegative(-A' * y - c), 2) / (1 + LinearAlgebra.norm(c, 2))
        + LinearAlgebra.norm(c' * x + b' * y, 2) / (1 + abs(c' * x) + abs(b'y))
    )
end


function pdhg_step!(problem::PDHGProblem, state::PDHGState)
    A, b, c = problem.A, problem.b, problem.c
    xₖ, yₖ = state.x, state.y
    η, τ = state.η, state.τ

    xₖ₊₁ = xₖ - η * (c + A'yₖ)
    project_nonnegative!(xₖ₊₁)
    Δx = xₖ₊₁ - xₖ

    Δy = τ * A * (2 * xₖ₊₁ - xₖ) - τ * b

    state.x += Δx
    state.y += Δy
    state.k += 1
end



function pdhg(problem::PDHGProblem; maxit=100000, η=nothing, τ=nothing, tol=1e-4, verbose=false)
    state = PDHGState(problem, η, τ)

    ϵ = tolerance_LP(problem, state)

    iterates = []
    while (state.k < maxit) && ϵ > tol
        verbose && @info "$(state.k) | $(problem.c'*state.x) | opt $(ϵ)"

        pdhg_step!(problem, state)
        ϵ = tolerance_LP(problem, state)
        push!(iterates, copy(state.x))
    end

    verbose && @info "$(state.k) | $(problem.c'*state.x) | opt $(ϵ)"

    return iterates

end


function solve_pdhg(
    A, b, c;
    maxit=100000, η=nothing, τ=nothing, tol=1e-4, verbose=false,
)

    m, n = size(A)
    problem = PDHGProblem(
        vcat(-c, c, zeros(m)),
        [A -A Matrix{Float64}(I, m, m)],
        b,
        m,
        n + n + m,
    )

    iterates = pdhg(problem, maxit=maxit, η=η, τ=τ, tol=tol, verbose=verbose)
    iterates_x = [x[1:n] - x[n+1:2n] for x in iterates]
    return iterates_x
end
