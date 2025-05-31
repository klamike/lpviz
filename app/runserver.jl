# usage: julia runserver.jl
#   or   julia runserver.jl [port]
#   or   julia runserver.jl [port] expose

using LPViz, HTTP, LoggingExtras, Artifacts, JSON3

LPVizHTTPExt = Base.get_extension(LPViz, :LPVizHTTPExt)


if abspath(PROGRAM_FILE) == @__FILE__
    verbose = true

    # Run each handler once
    LPVizHTTPExt.precompile_handlers(verbose)
    LPVizHTTPExt.fontpath() = artifact"JuliaMono" * "/webfonts/JuliaMono-Light.woff2"
    # Run the server forever
    # LoggingExtras.withlevel(verbose ? LoggingExtras.Debug : LoggingExtras.Info) do
    LPVizHTTPExt.runserver(
        port=parse(Int, get(ARGS, 1, "8080")),
        expose=length(ARGS) > 1 && ARGS[2] == "expose",
        verbose=verbose
    )
    # end
end
