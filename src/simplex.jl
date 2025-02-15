using Printf

function simplex_handler(lines, objective)
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


function revised_simplex(c::Vector{Float64}, A::Matrix{Float64}, b::Vector{Float64},
                         basis::Vector{Int}; tol=1e-8, verbose=false)
    m, n = size(A)
    x = zeros(n)

    verbose && @printf "%4s  %13s %13s  %8s %8s  %7s\n" "Iter" "PObj" "DObj"
    
    iterations = []
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
        pobj = dot(c[basis], x_B)
        dobj = dot(c, x)

        verbose && @printf "%4d  %+.6e %+.6e \n" length(iterations) pobj dobj

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


function simplex_solver(A::Matrix{Float64}, b::Vector{Float64}, c::Vector{Float64}; tol=1e-8)
    m, n = size(A)

    iterations = revised_simplex(
        vcat(c, -c, zeros(m)),
        [A  -A Matrix{Float64}(I, m, m)],
        b,
        collect(2*n + 1 : 2*n + m);
        tol=tol
    )
    iterations_original = [x[1:n] - x[n+1:2*n] for x in iterations]
    
    return iterations_original
end
