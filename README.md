# `lpviz`
`lpviz` is an interactive web app for visualizing [linear programming](https://youtu.be/kV1ru-Inzl4?si=KgasYrhSbqa_6Orh&t=3153) solvers. It's not hosted on the internet yet, so check the installation instructions below to get started running it locally.


<p align="center">
  <img width="291" alt="Screenshot 2025-02-14 at 10 50 20 PM" src="https://github.com/user-attachments/assets/8039ae4d-09f5-49f9-96fa-a52e1d62b9af" />
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img width="290" alt="Screenshot 2025-02-14 at 10 50 38 PM" src="https://github.com/user-attachments/assets/9b545634-9cc6-488e-82b4-6ce46b8294ff" />

  <br>
</p>


<p align="right"><i>Inspired by <a href="https://www.youtube.com/watch?v=ijD2KSXWDyo">advanced methods for establishing convexity</a>.</i></p>


## Installation

First, make sure you have [Julia](https://julialang.org/) installed ([juliaup](https://github.com/JuliaLang/juliaup?tab=readme-ov-file#installation) is recommended).
Then, to install `lpviz`, run:

```sh
git clone https://github.com/klamike/lpviz  # clone the repo
cd lpviz                                    # cd into it, and run the command below to install dependencies
julia -e 'import Pkg: activate as a, instantiate as i, develop as d; a("."); i(); a("app"); i(); d(path=".");'
```


## Usage

Run the command below, then go to [localhost:8080](http://localhost:8080) in your browser.
```sh
cd lpviz                                 # cd into the repo
julia --project=app app/runserver.jl     # run the Julia server
```
