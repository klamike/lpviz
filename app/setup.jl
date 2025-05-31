import Pkg

Pkg.activate(dirname(@__DIR__))
Pkg.instantiate()
Pkg.activate(joinpath(dirname(@__DIR__), "app"))
Pkg.instantiate()
Pkg.develop(path=dirname(@__DIR__))