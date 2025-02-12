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


function runserver(ROUTER, port=8080)
    HTTP.register!(ROUTER, "GET", "/", (req::HTTP.Request) -> HTTP.Response(200, CORS_RES_HEADERS, read(dirname(dirname(pathof(LPViz)))*"/static/index.html", String)))
    HTTP.register!(ROUTER, "POST", "/polytope", LPViz.polytope)
    HTTP.register!(ROUTER, "POST", "/trace_central_path", LPViz.trace_central_path)

    println("Starting server on http://localhost:$port")
    HTTP.serve!(ROUTER |> JSONMiddleware |> CorsMiddleware, Sockets.localhost, port)
end

if abspath(PROGRAM_FILE) == @__FILE__
    const ROUTER = HTTP.Router(cors404, cors405)
    runserver(ROUTER)
    while true
        sleep(1000) # FIXME
    end
end