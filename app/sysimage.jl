using PackageCompiler

# first, edit app.jl to remove the infinite loop, and set the sleep to something small.
# then, run julia --project=app --trace-compile=app/precompile.jl app/runserver.jl
# during the sleep, make sure to make some requests to the backend
# remember to put the while true loop back
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