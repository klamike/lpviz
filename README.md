# `lpviz`

`lpviz` is an interactive web app for visualizing [linear programming](https://youtu.be/kV1ru-Inzl4?si=KgasYrhSbqa_6Orh&t=3153) solvers. Try it now at [https://lpviz.net](https://lpviz.net), or check the installation instructions below to get started running it locally.

<p align="center">
  <!--<img width="291" alt="Screenshot 2025-02-14 at 10 50 20 PM" src="https://github.com/user-attachments/assets/8039ae4d-09f5-49f9-96fa-a52e1d62b9af" /> -->
  <img width="350" alt="Screenshot 2025-06-05 at 1 44 15 AM" src="https://github.com/user-attachments/assets/ac4bb972-5cf5-4248-8bad-1edbcb267b96" />
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
 <!-- <img width="290" alt="Screenshot 2025-02-14 at 10 50 38 PM" src="https://github.com/user-attachments/assets/9b545634-9cc6-488e-82b4-6ce46b8294ff" /> -->
<!-- <img width="350" alt="Screenshot 2025-09-02 at 2 14 38 PM" src="https://github.com/user-attachments/assets/003deacf-4f22-4a14-a7e3-cd3b88a23d1b" /> -->
<a href="https://lpviz.net/?s=('v!%5BB3.3A-3.3*2.2C-24.3*31.0C-23.0*28.7C23.9*14.0C21.225)%5D~o!B0.739752302879179A1.9074568226790765)~s!'ipm'~g!('a!0.1~i!1000))*25)%2CBA~y!B('x!C5A%01CBA*_"> <img width="290" height="965" alt="Screenshot 2025-09-03 at 2 24 44 PM" src="https://github.com/user-attachments/assets/a35556e9-127d-4cf5-9dd6-5fede73fe9ac" /> </a>

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

Then, you can run `bun run dev` to start the server.

Note that `lpviz` is a static website - all computations run in the browser.
