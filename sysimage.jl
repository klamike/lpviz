using PackageCompiler

# first, edit app.jl to remove the infinite loop, and set the sleep to something small.
# then, run julia --project=. --trace-precompile=precompile.jl app.jl
# during the sleep, make sure to make some requests to the backend
# remember to put the while true loop back
create_sysimage(
    [
        "Clarabel",
        "HTTP",
        "JSON3",
        "JuMP",
    ];
    sysimage_path="server.so",
    precompile_statements_file="precompile.jl"
);