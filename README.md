# lpviz


[![demo](https://github.com/user-attachments/assets/1cfa5ef2-16d6-40cc-a157-84fb04ba56f2)](https://github.com/user-attachments/assets/1cfa5ef2-16d6-40cc-a157-84fb04ba56f2)


## Installation

To run, install Julia (recommended [juliaup](https://github.com/JuliaLang/juliaup?tab=readme-ov-file#mac-linux-and-freebsd)).

Then clone this repo, cd into it, and run `julia --project=.`

Then in the julia REPL, type `] instantiate`

Then exit the REPL (ctrl+D) and run `julia --project=. app.jl`

Then open `localhost:8080` in your browser.








## To-do:

- Add option to plot iterates of solver instead of central path
- "Center" button so analytic center is at 0,0
- Support equality constraint (line)
- Reset button so you don't have to refresh to clear
- URL-based problem/weight sharing
- Save problem/weights to localStorage
- Example/random problems
- 3D objective visualization
- Barrier contours
- Add simplex mode
- Allow inequality inputs (currently forced to draw)
- Circle tool?
- Make julia package to include in sysimage, to reduce TTFP
