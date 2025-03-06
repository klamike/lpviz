module LPVizHTTPExt

using HTTP, JSON3, Artifacts
using LPViz


function runserver(; port=8080, verbose=false, expose=false)
    R = HTTP.Router(
        HTTP.Response(404, CORS_RES_HEADERS, ""),
        HTTP.Response(405, CORS_RES_HEADERS, ""),
    )
    register_static!(R; verbose=verbose)
    register_api!(R; verbose=verbose)
    HTTP.serve(
        cors(json(R)),
        expose ? "0.0.0.0" : "127.0.0.1", port,
        access_log=(
            verbose ? logfmt"[$time_local] $request_method $request_uri $status ($body_bytes_sent bytes)" : nothing
        )
    )
end


function LPViz.polytope(req::HTTP.Request)
    return LPViz.polytope(convert(Vector{Vector{Float64}}, req.body["points"]))
end

function LPViz.simplex(req::HTTP.Request)
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    return LPViz.simplex(lines, objective)
end

function LPViz.pdhg(req::HTTP.Request)
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    maxit = get(data, "maxit", 1000)
    η = get(data, "eta", 0.25)
    τ = get(data, "tau", 0.25)
    return LPViz.pdhg(lines, objective, maxit=maxit, η=η, τ=τ)
end


function LPViz.ipm(req::HTTP.Request)
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    ϵ_p = get(data, "ϵ_p", 1e-6)
    ϵ_d = get(data, "ϵ_d", 1e-6)
    ϵ_opt = get(data, "ϵ_opt", 1e-6)
    nitermax = get(data, "nitermax", 30)
    αmax = get(data, "alphamax", 0.9990)
    return LPViz.ipm(lines, objective;
    ϵ_p=ϵ_p, ϵ_d=ϵ_d, ϵ_opt=ϵ_opt, nitermax=nitermax, αmax=αmax
)
end


function LPViz.central_path(req::HTTP.Request)
    data = req.body
    lines = convert(Vector{Vector{Float64}}, data["lines"])
    objective = convert(Vector{Float64}, data["objective"])
    weights = convert(Vector{Float64}, get(data, "weights", ones(length(lines))))
    mu_values = convert(Vector{Float64}, get(data, "mu_values", LPViz.default_mu_values(nothing)))
    return LPViz.central_path(lines, objective; weights=weights, mu_values=mu_values)
end

function register_api!(ROUTER; verbose=false)
    handlers = [
        ("/polytope", LPViz.polytope),
        ("/central_path", LPViz.central_path),
        ("/ipm", LPViz.ipm),
        ("/simplex", LPViz.simplex),
        ("/pdhg", LPViz.pdhg)
    ]
    for (path, handler) in handlers
        HTTP.register!(ROUTER, "POST", path, handler)
    end
end

function serve_static(path_suffix::String, mime_type::String; suffix=true)
    @info "serving static file: $path_suffix"
    file_path = if suffix
        joinpath(joinpath(dirname(dirname(pathof(LPViz))), "static"), path_suffix)
    else
        path_suffix
    end
    @info "from path $file_path"
    try
        content = read(file_path, String)
        return HTTP.Response(200, [("Content-Type" => mime_type)], content)
    catch e
        return HTTP.Response(404, [], "File not found: $(path_suffix)")
    end
end

function register_static!(ROUTER; verbose=false)
    handlers = [
        ("/", (req::HTTP.Request) -> serve_static("index.html", "")),
        ("/style.css", (req::HTTP.Request) -> serve_static("style.css", "text/css")),
        ("/font.woff2", (req::HTTP.Request) -> serve_static(artifact"JuliaMono" * "/webfonts/JuliaMono-Light.woff2", "font/woff2", suffix=false))
    ]
    for file in readdir(joinpath(joinpath(dirname(dirname(pathof(LPViz))), "static", "js")))
        push!(handlers, ("/js/$(file)", (req::HTTP.Request) -> serve_static("js/$(file)", "application/javascript")))
    end

    for (path, handler) in handlers
        HTTP.register!(ROUTER, "GET", path, handler)
    end
end


function precompile_handlers(verbose)
    @info "Precompiling handlers..."
    points::Vector{Vector{Float64}} = [[-2, 2], [2, 2], [2, -2], [-2, -2]]
    lines::Vector{Vector{Float64}} = [[0, 1, 2], [1, 0, 2], [0, -1, 2], [-1, 0, 2]]
    objective::Vector{Float64} = [1, 1]
    weights::Vector{Float64} = [1, 1, 1, 1]

    verbose && @info "Calling polytope"
    LPViz.polytope(HTTP.Request("POST", "/polytope", [], Dict("points" => points)))
    
    verbose && @info "Calling central_path"
    LPViz.central_path(HTTP.Request("POST", "/central_path", [], Dict("lines" => lines, "objective" => objective, "weights" => weights, "mu_values" => [1.0])))
    
    verbose && @info "Calling simplex"
    LPViz.simplex(HTTP.Request("POST", "/simplex", [], Dict("lines" => lines, "objective" => objective)))
    
    verbose && @info "Calling pdhg"
    LPViz.pdhg(HTTP.Request("POST", "/pdhg", [], Dict("lines" => lines, "objective" => objective, "maxit" => 10, "eta" => 0.25, "tau" => 0.25)))
    
    verbose && @info "Calling ipm"
    LPViz.ipm(HTTP.Request("POST", "/ipm", [], Dict("lines" => lines, "objective" => objective, "weights" => weights, "alphamax" => 0.1, "nitermax" => 10)))
    
    verbose && @info "Getting JuliaMono"
    read(artifact"JuliaMono" * "/webfonts/JuliaMono-Light.woff2")
end

const CORS_OPT_HEADERS = [ # FIXME
    "Access-Control-Allow-Origin"  => "*",
    "Access-Control-Allow-Headers" => "*",
    "Access-Control-Allow-Methods" => "POST, GET, OPTIONS"
]
const CORS_RES_HEADERS = [
    "Access-Control-Allow-Origin" => "*"
]


cors(handler) = (req::HTTP.Request) -> begin
    if HTTP.method(req) == "OPTIONS"
        HTTP.Response(200, CORS_OPT_HEADERS)
    else
        handler(req)
    end
end

json(handler) = (req::HTTP.Request) -> begin
    if !isempty(req.body)
        req.body = JSON3.read(String(req.body))
    end
    ret = handler(req)
    if ret isa HTTP.Response
        return ret
    else
        return HTTP.Response(200, CORS_RES_HEADERS, ret === nothing ? "" : JSON3.write(ret))
    end
end


end # module