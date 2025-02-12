using PackageCompiler

# first, edit runserver.jl to use HTTP.serve! instead of HTTP.serve, and put a sleep(60) after runserver(ROUTER).
# this will only keep the server alive for 60 seconds instead of indefinitely.
# then, run julia --project=app --trace-compile=app/precompile.jl app/runserver.jl
# during the sleep, make sure to make some requests to the backend
# now use julia --sysimage=app/server.so app/runserver.jl
# remember to put the serve! back
create_sysimage(
    [
        "LPViz",
        "HTTP",
        "JSON3",
        "Sockets",
    ];
    sysimage_path="app/server.so",
    precompile_statements_file="app/precompile.jl"
);