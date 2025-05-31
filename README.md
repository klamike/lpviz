# `lpviz`
`lpviz` is an interactive web app for visualizing [linear programming](https://youtu.be/kV1ru-Inzl4?si=KgasYrhSbqa_6Orh&t=3153) solvers. Try it now at [https://lpviz.net](https://lpviz.net), or check the installation instructions below to get started running it locally.


<p align="center">
  <img width="291" alt="Screenshot 2025-02-14 at 10 50 20 PM" src="https://github.com/user-attachments/assets/8039ae4d-09f5-49f9-96fa-a52e1d62b9af" />
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img width="290" alt="Screenshot 2025-02-14 at 10 50 38 PM" src="https://github.com/user-attachments/assets/9b545634-9cc6-488e-82b4-6ce46b8294ff" />

  <br>
</p>


<p align="right"><i>Inspired by <a href="https://www.youtube.com/watch?v=ijD2KSXWDyo">advanced methods for establishing convexity</a>.</i></p>


## Installation

You can use `lpviz` now at [https://lpviz.net](https://lpviz.net). If you'd like to run it locally instead, follow the instructions below.

First, make sure you have [Bun](https://bun.sh/) installed.
Then, to install `lpviz` and its dependencies, run:

```sh
git clone https://github.com/klamike/lpviz  # clone the repo
cd lpviz                                    # cd into it
bun install                                 # install frontend dependencies
```

Then, you can run `bun run dev` to start the server and `bun run build` to build.