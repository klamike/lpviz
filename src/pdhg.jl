# based on https://github.com/klamike/SimplePDHG.jl

function pdhg_handler(lines::Vector{Vector{Float64}}, objective::Vector{Float64})
    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i] = lines[i][3]
    end
    return solve_pdhg(A, b, objective)
end

function max_singular_value_PDHG(A)
    σmaxA = LinearAlgebra.norm(A, 2)
    return σmaxA
end

struct LP_Data{T<:Real,I<:Integer}
    c::AbstractVector{T} # cost vector of length n
    A
    b::AbstractVector{T} # resource vector of length m
    m::I # number of rows of A
    n::I # number of columns of A
end

mutable struct PDHG_state{T<:AbstractVecOrMat{<:Real},I<:Integer} # contains information regarding one iterattion sequence
    x::T # iterate x_n
    y::T # iterate y_n
    z::T # iterate z_n
    η::Real # step size
    τ::Real # step size
    k::I # iteration counter  
    st::MOI.TerminationStatusCode # termination status
    sp::MOI.ResultStatusCode # primal status
    sd::MOI.ResultStatusCode # dual status
end

function PDHG_state(problem::LP_Data{T,I}) where {T<:Real,I<:Integer}
    n = problem.n
    m = problem.m
    σmaxA = max_singular_value_PDHG(problem.A)
    η_preli = (1 / (σmaxA)) - 1e-6
    τ_preli = (1 / (σmaxA)) - 1e-6
    @assert η_preli > 0 && τ_preli > 0 "Got negative initial step sizes"
    x_0 = zeros(T, n)
    y_0 = zeros(T, m)
    return PDHG_state(x_0, y_0, problem.c, η_preli, τ_preli, 1, MOI.OPTIMIZE_NOT_CALLED, MOI.UNKNOWN_RESULT_STATUS, MOI.UNKNOWN_RESULT_STATUS)
end

function project_nonnegative!(x::AbstractVector{T}) where {T<:Real}
    for i in eachindex(x)
        x[i] = max(zero(T), x[i])
    end
end

function project_nonnegative(x::AbstractVector{T}) where {T<:Real}
    y = zeros(length(x))
    for i in eachindex(y)
        y[i] = max(zero(T), y[i])
    end
    return y
end

function tolerance_LP(A, b::AbstractVector{T}, c::AbstractVector{T}, x::AbstractVector{T}, y::AbstractVector{T}, z::AbstractVector{T}) where {T<:Real}
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

function PDHG_step(problem::LP_Data, state::PDHG_state)
    xnew = state.x - state.η * state.z
    project_nonnegative!(xnew)
    Δx = xnew - state.x

    Δy = state.τ * problem.A * (2 * xnew - state.x) - state.τ * problem.b

    znew = problem.c + problem.A' * (state.y + Δy)
    Δz = znew - state.z

    return PDHG_step(Δx, Δy, Δz)
end

function apply_step!(state::PDHG_state, step::PDHG_step)
    state.x += step.Δx
    state.y += step.Δy
    state.z += step.Δz
    state.k += 1
end

function PDHG_iteration!(problem::LP_Data, state::PDHG_state)
    step = PDHG_step(problem, state)
    apply_step!(state, step)
end


function pdhg(problem::LP_Data; maxit=100000, tol=1e-4, verbose=false, freq=1000)
    state = PDHG_state(problem)

    tc, tpc, tx, tz = tolerance_LP(problem.A, problem.b, problem.c, state.x, state.y, state.z)
    # NOTE: only tc is used for termination

    ## time to run the loop
    iterates = []
    while (state.k < maxit) && tc > tol
        # print information if verbose = true
        if verbose == true
            if mod(state.k, freq) == 0
                @info "$(state.k) | $(problem.c'*state.x) | opt $(tc) | tpc $(tpc) | tx $(tx) | tz $(tz)"
            end
        end
        # compute a new state
        PDHG_iteration!(problem, state)
        tc, tpc, tx, tz = tolerance_LP(problem.A, problem.b, problem.c, state.x, state.y, state.z)
        push!(iterates, copy(state.x))
    end

    if verbose == true
        @info "$(state.k) | $(problem.c'*state.x) | opt $(tc) | tpc $(tpc) | tx $(tx) | tz $(tz)"
    end

    return iterates

end


function solve_pdhg(
    A,
    b::Vector{T},
    c::Vector{T};
    maxit=100000, tol=1e-4, verbose=false, freq=1000,
) where {T<:Real}

    # create the data object
    m, n = size(A)
    problem = LP_Data(
        vcat(-c, c, zeros(m)),
        [A -A Matrix{Float64}(I, m, m)],
        b,
        m,
        n + n + m,
    )
    # solve the problem
    iterates = pdhg(problem, maxit=maxit, tol=tol, verbose=verbose, freq=freq)
    iterates_x = [x[1:n] - x[n+1:2n] for x in iterates]
    return iterates_x
end
