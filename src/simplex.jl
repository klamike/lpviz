using Printf

function simplex_handler(lines::Vector{Vector{Float64}}, objective::Vector{Float64})
    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i]    = lines[i][3]
    end
    return simplex_solver(A, b, objective)
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

# max c'x s.t. Ax ≤ b
@inline function simplex_solver(A::Matrix{Float64}, b::Vector{Float64}, c::Vector{Float64}; tol=1e-8)
    m, n = size(A)

    # transform to Ax = b and x ≥ 0 by adding slacks and x free via x1 and x2 ≥ 0
    # so we have
    # max c'(x1 - x2) s.t. A(x1 - x2) = b, x1, x2 ≥ 0
    # or 
    # max c'x1 - c'x2 s.t. Ax1 - Ax2 = b, x1, x2 ≥ 0
    iterations = revised_simplex(
        vcat(c, -c, zeros(m)),            # [ c -c 0 ]
        [A  -A Matrix{Float64}(I, m, m)], # [ A -A I ]
        b,                                # [ b ]
        collect(2*n + 1 : 2*n + m);       # initial basis is all slack variables
        tol=tol
    )
    iterations_original = [x[1:n] - x[n+1:2*n] for x in iterations] # x = x1 - x2
    
    return iterations_original
end
