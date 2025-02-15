using HTTP, Sockets


include("middleware.jl")
include("handlers.jl")

function runserver(ROUTER; port=8080, verbose=false, kwargs...)
    register_static!(ROUTER)
    register_api!(ROUTER)
    verbose && setindex!(kwargs, logfmt"[$time_local] $request_method $request_uri $status ($body_bytes_sent bytes)", "access_log")
    HTTP.serve(
        ROUTER |> JSONMiddleware |> CorsMiddleware,
        Sockets.localhost, port,
        kwargs...,
    )
end

if abspath(PROGRAM_FILE) == @__FILE__
    const ROUTER = HTTP.Router(
        HTTP.Response(404, CORS_RES_HEADERS, ""),
        HTTP.Response(405, CORS_RES_HEADERS, ""),
    )
    runserver(ROUTER; port=get(ARGS, 1, 8080))
end