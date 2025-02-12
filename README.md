# lpviz


[![demo](https://github.com/user-attachments/assets/1cfa5ef2-16d6-40cc-a157-84fb04ba56f2)](https://github.com/user-attachments/assets/1cfa5ef2-16d6-40cc-a157-84fb04ba56f2)


## Installation

1. Install Julia (recommended [juliaup](https://github.com/JuliaLang/juliaup?tab=readme-ov-file#mac-linux-and-freebsd))
1. Clone this repo, cd into it, and run `julia`
1. Run `] activate .`
1. Run `] instantiate`
1. Run `] activate app`
1. Run `] instantiate`
1. Run `] dev .`
1. Press `Ctrl-D` to exit
1. Run `julia --project=app app/runserver.jl`
1. Go to `localhost:8080` in your browser


## To-do:

- Double-click bug (rare)
- Click to hide objective, click to keep constraint highlighted (stacking), same for iterates
- Normalize weights button (sum to #constraints)
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
- Improve installation process