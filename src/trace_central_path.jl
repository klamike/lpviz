function trace_central_path_handler(req::HTTP.Request)
    data = req.body
    lines = data["lines"]
    objective = data["objective"]
    mu_values = get(data, "mu_values", nothing)
    weights = get(data, "weights", nothing)
    return compute_central_path(lines, objective; mu_values=mu_values, weights=weights)
end

function default_mu_values(mu_values)
    if mu_values === nothing
        return [10.0^p for p in [3, 2, 1.5, 1, 0.5, 0, -0.5, -1, -3, -5]]
    else
        return mu_values
    end
end

function default_weights(weights, num_lines)
    if weights === nothing
        return ones(num_lines)
    else
        return weights
    end
end

function filter_lines_and_weights(lines, weights)
    nonzero_indices = [i for i in 1:length(lines) if weights[i] != 0]
    filtered_lines = [lines[i] for i in nonzero_indices]
    filtered_weights = [weights[i] for i in nonzero_indices]
    return filtered_lines, filtered_weights
end

function solve_for_mu(lines, objective, weights, mu)
    m = length(lines)
    model = Model(Clarabel.Optimizer)
    set_silent(model)

    @variable(model, x[1:2])
    @variable(model, t[1:m])

    for i in 1:m
        A = lines[i][1]
        B = lines[i][2]
        C = lines[i][3]
        @constraint(model, [t[i], 1, C - (A * x[1] + B * x[2])] in MOI.ExponentialCone())
    end

    @objective(model, Max,
        sum(objective[i] * x[i] for i in 1:2) +
        mu * sum(weights[i] * t[i] for i in 1:m)
    )
    
    optimize!(model)
    stat = termination_status(model)
    if is_solved_and_feasible(model, allow_almost=true)
        return value.(x)
    else
        println("Failed μ = $mu with status $stat for model:")
        println(model)
        return nothing
    end
end

function compute_central_path(lines, objective; mu_values=nothing, weights=nothing)
    mu_values = default_mu_values(mu_values)
    weights = default_weights(weights, length(lines))
    
    lines, weights = filter_lines_and_weights(lines, weights)
    m = length(lines)
    if m == 0
        return Dict("error" => "No lines provided after filtering zero weights")
    end

    central_path = []
    for mu in mu_values
        x_val = solve_for_mu(lines, objective, weights, mu)
        if x_val !== nothing
            push!(central_path, (x_val, mu))
        end
    end
    return Dict("central_path" => central_path)
end
