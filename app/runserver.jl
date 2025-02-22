using HTTP, Sockets, LoggingExtras


include("middleware.jl")
include("handlers.jl")

function runserver(ROUTER; port=8080, verbose=false, expose=false)
    register_static!(ROUTER)
    register_api!(ROUTER)
    LoggingExtras.withlevel(verbose ? LoggingExtras.Debug : LoggingExtras.Info) do
        HTTP.serve(
            ROUTER |> JSONMiddleware |> CorsMiddleware,
            expose ? ip"0.0.0.0" : Sockets.localhost, port,
            access_log=(
                verbose ? logfmt"[$time_local] $request_method $request_uri $status ($body_bytes_sent bytes)" : nothing
            )
        )
    end
end

if abspath(PROGRAM_FILE) == @__FILE__
    const ROUTER = HTTP.Router(
        HTTP.Response(404, CORS_RES_HEADERS, ""),
        HTTP.Response(405, CORS_RES_HEADERS, ""),
    )
    # usage: julia runserver.jl
    #   or   julia runserver.jl [port]
    #   or   julia runserver.jl [port] expose
    runserver(ROUTER;
        port=parse(Int, get(ARGS, 1, "8080")),
        verbose=false,
        expose=length(ARGS) > 1 && ARGS[2] == "expose"
    )
end
