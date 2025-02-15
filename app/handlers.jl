using HTTP, Artifacts
using LPViz


function polytope_handler(req::HTTP.Request)
    points = req.body["points"]
    return LPViz.compute_polytope(points)
end


function simplex_handler(req::HTTP.Request)
    data = req.body
    lines = data["lines"]
    objective = convert(Vector{Float64}, data["objective"])
    return LPViz.simplex_handler(lines, objective)
end


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

    return LPViz.ipm_handler(lines, objective, weights;
        ϵ_p=ϵ_p, ϵ_d=ϵ_d, ϵ_opt=ϵ_opt,
        nitermax=nitermax, αmax=αmax
    )
end


function trace_central_path_handler(req::HTTP.Request)
    data = req.body
    lines = data["lines"]
    objective = data["objective"]
    mu_values = get(data, "mu_values", nothing)
    weights = get(data, "weights", nothing)
    return LPViz.compute_central_path(lines, objective; mu_values=mu_values, weights=weights)
end


function serve_static(path_suffix::String; suffix=true)
    file_path = if suffix
        joinpath(joinpath(dirname(dirname(pathof(LPViz))), "static"), path_suffix)
    else
        path_suffix
    end
    try
        content = read(file_path, String)
        return HTTP.Response(200, CORS_RES_HEADERS, content)
    catch e
        return HTTP.Response(404, CORS_RES_HEADERS, "File not found: $(path_suffix)")
    end
end


function register_api!(ROUTER)
    HTTP.register!(ROUTER, "POST", "/polytope", polytope_handler)
    HTTP.register!(ROUTER, "POST", "/trace_central_path", trace_central_path_handler)
    HTTP.register!(ROUTER, "POST", "/ipm", ipm_handler)
    HTTP.register!(ROUTER, "POST", "/simplex", simplex_handler)
end


function register_static!(ROUTER)
    HTTP.register!(ROUTER, "GET", "/", (req::HTTP.Request) -> serve_static("index.html"))
    HTTP.register!(ROUTER, "GET", "/style.css", (req::HTTP.Request) -> serve_static("style.css"))
    HTTP.register!(ROUTER, "GET", "/main.js", (req::HTTP.Request) -> serve_static("main.js"))
    HTTP.register!(ROUTER, "GET", "/font.woff2", (req::HTTP.Request) -> serve_static(artifact"JuliaMono" * "/webfonts/JuliaMono-Light.woff2", suffix=false))
end