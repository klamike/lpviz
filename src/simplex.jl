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
                         basis::Vector{Int}; tol=1e-8, verbose=false)
    m, n = size(A)
    x = zeros(n)

    verbose && @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj"
    
    iterations = Vector{Vector{Float64}}(undef, 0)
    while true
        B = A[:, basis]
        Binv = inv(B)
        
        x_B = Binv * b
        x .= 0.0
        for i in 1:m
            x[basis[i]] = x_B[i]
        end
        push!(iterations, (copy(x)))
        y = c[basis]' * Binv

        verbose && @printf "%4d  %+.6e %+.6e \n" length(iterations) dot(c[basis], x_B) dot(c, x)

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
        
        d = Binv * A[:, entering]
        
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
    
    return iterations
end

"""
    phase1_simplex(A, b, c)

Compute primal-feasible basis for `Ax = b, x ≥ 0`.

This is done by solving the auxiliary problem
min e't  s.t. Ax + t = b, x ≥ 0, t ≥ 0.
The initial feasible basis for this problem is `x=0, t=b`.
"""
function phase1_simplex(A, b, c; tol=1e-8, verbose=false, nitermax=1000)
    m, n = size(A)

    # Padd constraint matrix with identity
    A_ = hcat(A, I)
    b_ = b
    c_ = vcat(zeros(n), ones(m))

    # Working memory
    x = zeros(Float64, n+m)  # primal variables
    y = zeros(Float64, m)    # dual variables
    z = zeros(Float64, n+m)  # reduced costs
    Ib = zeros(Bool, n+m)    # variable basic status (true means basic)
    iterations = Vector{Float64}[]

    # Setup initial basis: x=0, t is basic
    Ib[(n+1):(n+m)] .= 1  # t in the basis
    
    # Solve feasibility problem...
    niter = 0
    verbose && @printf "%4s  %13s %13s  %8s %8s\n" "Iter" "pobj" "dobj" "pfeas" "dfeas"
    while true
        # Compute basis & basis inverse
        B = A_[:, Ib]
        Binv = inv(B)

        # Compute primal iterate
        x .= 0
        @views mul!(x[Ib], Binv, b_)

        # Compute dual variables and their reduced cost
        @views mul!(y, transpose(Binv), c_[Ib])
        z = c_ - A_'y

        # Compute objectives and residuals
        pobj = dot(c_, x)
        dobj = dot(b_, y)
        pfeas = maximum(x[(n+1):(n+m)])  # FIXME: we should show minimum(t)
        dfeas = min(0, minimum(z))

        verbose && @printf "%4d  %+.6e %+.6e  %.2e %.2e\n" niter pobj dobj pfeas dfeas

        # Track (primal) iterates
        push!(iterations, copy(x[1:n]))

        # Convergence checks
        # If t <= tol, we have a feasible solution, and we should stop
        if maximum(x[(n+1):(n+m)]) <= tol
            verbose && @printf "Feasible basis found\n"
            break
        elseif niter >= nitermax
            verbose && @printf "Maximum iterations reached\n"
            break
        end

        # find variable with most negative reduced cost
        j_enter = argmin(z)

        # Ratio test, compute index of variable that leaves the basis
        δ = Binv * A_[:, j_enter]
        j_exit = 0  # index of variable exiting the basis
        α = Inf     # length of pivot
        k = 0       # i is the k-th basic variable
        for i in 1:(n+m)
            k += Ib[i]
            Ib[i] || continue
            xi = x[i]
            δi = δ[k]
            δi > 0 || continue
            αi = xi / δi
            if αi < α
                j_exit = i
                α = αi
            end
        end

        # TODO: check for unboundedness, ratio test, etc...
        # Skipped because this is a Phase 1,
        # so we should not have any unbounded problem

        # Update basis
        Ib[j_enter] = true
        Ib[j_exit] = false

        niter += 1
    end

    return Ib, iterations
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

    # transform to Ax = b and x ≥ 0 by adding slacks and x free via x1 and x2 ≥ 0
    # so we have
    # max c'(x1 - x2) s.t. A(x1 - x2) + s = b, x1, x2, s ≥ 0
    # or 
    # max c'x1 - c'x2 s.t. Ax1 - Ax2 + s = b, x1, x2 ≥ 0, s ≥
    # Convert to standard form
    c_std = vcat(c, -c, zeros(m))             # [ c -c 0 ]
    A_std = [A  -A Matrix{Float64}(I, m, m)]  # [ A -A I ]
    b_std = b                                 # [ b ]
    # Make sure RHS is non-negative (this is for phase 1)
    # Note: this re-scaling would affect dual variables `y`,
    #   but does not change primal variables.
    γ = map(x -> (x < 0 ? -1.0 : 1.0), b_std)
    Γ = Diagonal(γ)
    b_std = Γ * b_std  # Note: can also use lmul!(Γ, b_std)
    A_std = Γ * A_std  # Note: can also use lmul!(Γ, b_std)
    
    iterations = revised_simplex(
        c_std,
        A_std,
        b_std,
        collect(2*n + 1 : 2*n + m);       # initial basis is all slack variables
        tol=tol,
        verbose=verbose
    )
    iterations_original = [x[1:n] - x[n+1:2*n] for x in iterations] # x = x1 - x2
    
    return iterations_original
end
