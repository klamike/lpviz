using Artifacts
using HTTP, JSON3, Sockets
using LPViz

const CORS_OPT_HEADERS = ["Access-Control-Allow-Origin"  => "*", "Access-Control-Allow-Headers" => "*", "Access-Control-Allow-Methods" => "POST, GET, OPTIONS"]
const CORS_RES_HEADERS = ["Access-Control-Allow-Origin" => "*"]
cors404(::HTTP.Request) = HTTP.Response(404, CORS_RES_HEADERS, "")
cors405(::HTTP.Request) = HTTP.Response(405, CORS_RES_HEADERS, "")
CorsMiddleware(handler) = (req::HTTP.Request) -> HTTP.method(req) == "OPTIONS" ? HTTP.Response(200, CORS_OPT_HEADERS) : handler(req)
JSONMiddleware(handler) = (req::HTTP.Request) -> begin
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

function serve_static(path_suffix::String; suffix=true)
    if suffix
        static_dir = joinpath(dirname(dirname(pathof(LPViz))), "static")
        file_path = joinpath(static_dir, path_suffix)
    else
        file_path = path_suffix
    end
    try
        content = read(file_path, String)
        return HTTP.Response(200, CORS_RES_HEADERS, content)
    catch e
        return HTTP.Response(404, CORS_RES_HEADERS, "File not found: $(path_suffix)")
    end
end

function runserver(ROUTER, port=8080)
    HTTP.register!(ROUTER, "GET", "/", (req::HTTP.Request) -> serve_static("index.html"))
    HTTP.register!(ROUTER, "GET", "/style.css", (req::HTTP.Request) -> serve_static("style.css"))
    HTTP.register!(ROUTER, "GET", "/main.js", (req::HTTP.Request) -> serve_static("main.js"))
    HTTP.register!(ROUTER, "GET", "/JuliaMono-Light.woff2", (req::HTTP.Request) -> serve_static(artifact"JuliaMono" * "/webfonts/JuliaMono-Light.woff2", suffix=false))

    HTTP.register!(ROUTER, "POST", "/polytope", LPViz.polytope_handler)
    HTTP.register!(ROUTER, "POST", "/trace_central_path", LPViz.trace_central_path_handler)
    HTTP.serve(ROUTER |> JSONMiddleware |> CorsMiddleware, Sockets.localhost, port)
end

if abspath(PROGRAM_FILE) == @__FILE__
    const ROUTER = HTTP.Router(cors404, cors405)
    runserver(ROUTER)
end