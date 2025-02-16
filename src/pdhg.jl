# based on https://github.com/klamike/SimplePDHG.jl

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


struct PDHGProblem{T<:Real,I<:Integer}
    c::AbstractVector{T}
    A::AbstractMatrix{T}
    b::AbstractVector{T}
    m::I # number of rows of A
    n::I # number of columns of A
end

mutable struct PDHGState{T<:AbstractVecOrMat{<:Real},I<:Integer} # contains information regarding one iterattion sequence
    x::T # iterate x_n
    y::T # iterate y_n
    z::T # iterate z_n
    η::Real # step size
    τ::Real # step size
    k::I # iteration counter
end

function PDHGState(problem::PDHGProblem{T,I}, η, τ) where {T<:Real,I<:Integer}
    n = problem.n
    m = problem.m
    x_0 = zeros(T, n)
    y_0 = zeros(T, m)
    return PDHGState(x_0, y_0, problem.c, η, τ, 1)
end

function project_nonnegative!(x::AbstractVector{T}) where {T<:Real}
    for i in eachindex(x)
        x[i] = max(zero(T), x[i])
    end
end

function project_nonnegative(x::AbstractVector{T}) where {T<:Real}
    y = zeros(T, length(x))
    for i in eachindex(x)
        y[i] = max(zero(T), x[i])
    end
    return y
end

function tolerance_LP(A::AbstractMatrix{T}, b::AbstractVector{T}, c::AbstractVector{T}, x::AbstractVector{T}, y::AbstractVector{T}, z::AbstractVector{T}) where {T<:Real}
    ϵ = LinearAlgebra.norm(A * x - b, 2) / (1 + LinearAlgebra.norm(b, 2)) + LinearAlgebra.norm(project_nonnegative(-A' * y - c), 2) / (1 + LinearAlgebra.norm(c, 2)) + LinearAlgebra.norm(c' * x + b' * y, 2) / (1 + abs(c' * x) + abs(b'y))
    tolerance_pc = LinearAlgebra.norm(A * x - b, 2)
    tolerance_x = LinearAlgebra.norm(project_nonnegative(-x), 2)
    tolerance_z = LinearAlgebra.norm(project_nonnegative(-z), 2)
    return ϵ, tolerance_pc, tolerance_x, tolerance_z
end

mutable struct PDHG_step{T}
    Δx::T
    Δy::T
    Δz::T
end

function PDHG_step(problem::PDHGProblem, state::PDHGState)
    xnew = state.x - state.η * state.z
    project_nonnegative!(xnew)
    Δx = xnew - state.x

    Δy = state.τ * problem.A * (2 * xnew - state.x) - state.τ * problem.b

    znew = problem.c + problem.A' * (state.y + Δy)
    Δz = znew - state.z

    return PDHG_step(Δx, Δy, Δz)
end

function apply_step!(state::PDHGState, step::PDHG_step)
    state.x += step.Δx
    state.y += step.Δy
    state.z += step.Δz
    state.k += 1
end

function PDHG_iteration!(problem::PDHGProblem, state::PDHGState)
    step = PDHG_step(problem, state)
    apply_step!(state, step)
end


function pdhg(problem::PDHGProblem; maxit=100000, η=nothing, τ=nothing, tol=1e-4, verbose=false)
    state = PDHGState(problem, η, τ)

    tc, tpc, tx, tz = tolerance_LP(problem.A, problem.b, problem.c, state.x, state.y, state.z)

    ## time to run the loop
    iterates = []
    while (state.k < maxit) && tc > tol
        verbose && @info "$(state.k) | $(problem.c'*state.x) | opt $(tc) | tpc $(tpc) | tx $(tx) | tz $(tz)"

        # compute a new state
        PDHG_iteration!(problem, state)
        tc, tpc, tx, tz = tolerance_LP(problem.A, problem.b, problem.c, state.x, state.y, state.z)
        push!(iterates, copy(state.x))
    end

    verbose && @info "$(state.k) | $(problem.c'*state.x) | opt $(tc) | tpc $(tpc) | tx $(tx) | tz $(tz)"

    return iterates

end


function solve_pdhg(
    A,
    b::Vector{T},
    c::Vector{T};
    maxit=100000, η=nothing, τ=nothing, tol=1e-4, verbose=false,
) where {T<:Real}

    # create the data object
    m, n = size(A)
    problem = PDHGProblem(
        vcat(-c, c, zeros(m)),
        [A -A Matrix{Float64}(I, m, m)],
        b,
        m,
        n + n + m,
    )
    # solve the problem
    iterates = pdhg(problem, maxit=maxit, η=η, τ=τ, tol=tol, verbose=verbose)
    iterates_x = [x[1:n] - x[n+1:2n] for x in iterates]
    return iterates_x
end
