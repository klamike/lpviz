using HTTP, JSON3


const CORS_OPT_HEADERS = [ # FIXME
    "Access-Control-Allow-Origin"  => "*",
    "Access-Control-Allow-Headers" => "*",
    "Access-Control-Allow-Methods" => "POST, GET, OPTIONS"
]
const CORS_RES_HEADERS = [
    "Access-Control-Allow-Origin" => "*"
]


CorsMiddleware(handler) = (req::HTTP.Request) -> begin
    if HTTP.method(req) == "OPTIONS"
        HTTP.Response(200, CORS_OPT_HEADERS)
    else
        handler(req)
    end
end

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