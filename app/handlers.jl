using HTTP, Artifacts
using LPViz


function polytope_handler(req::HTTP.Request)
    # tserve = @elapsed begin
    points = convert(Vector{Vector{Float64}}, req.body["points"])
    ret = LPViz.compute_polytope(points)
    # end
    # @info "polytope: $tserve"
    return ret
end


function simplex_handler(req::HTTP.Request)
    # tserve = @elapsed begin
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    ret = LPViz.simplex_handler(lines, objective)
    # end
    # @info "simplex: $tserve"
    return ret
end

function pdhg_handler(req::HTTP.Request)
    # tserve = @elapsed begin
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    ret = LPViz.pdhg_handler(lines, objective)
    # end
    # @info "pdhg: $tserve"
    return ret
end


function ipm_handler(req::HTTP.Request)
    # tserve = @elapsed begin
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    ϵ_p = get(data, "ϵ_p", 1e-6)
    ϵ_d = get(data, "ϵ_d", 1e-6)
    ϵ_opt = get(data, "ϵ_opt", 1e-6)
    nitermax = get(data, "nitermax", 30)
    αmax = get(data, "αmax", 0.9990)

    ret = LPViz.ipm_handler(lines, objective, ones(length(lines));
        ϵ_p=ϵ_p, ϵ_d=ϵ_d, ϵ_opt=ϵ_opt,
        nitermax=nitermax, αmax=αmax
    )
    # end
    # @info "ipm: $tserve"
    return ret
end


function trace_central_path_handler(req::HTTP.Request)
    # tserve = @elapsed begin
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    weights = convert(Vector{Float64}, get(data, "weights", ones(length(lines))))
    ret = LPViz.compute_central_path(lines, objective; weights=weights)
    # end
    # @info "trace_central_path: $tserve"
    return ret
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
    HTTP.register!(ROUTER, "POST", "/pdhg", pdhg_handler)
end


function register_static!(ROUTER)
    HTTP.register!(ROUTER, "GET", "/", (req::HTTP.Request) -> serve_static("index.html"))
    HTTP.register!(ROUTER, "GET", "/style.css", (req::HTTP.Request) -> serve_static("style.css"))
    HTTP.register!(ROUTER, "GET", "/main.js", (req::HTTP.Request) -> serve_static("main.js"))
    HTTP.register!(ROUTER, "GET", "/font.woff2", (req::HTTP.Request) -> serve_static(artifact"JuliaMono" * "/webfonts/JuliaMono-Light.woff2", suffix=false))
end