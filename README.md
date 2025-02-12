# lpviz


To run, install Julia (recommended [juliaup](https://github.com/JuliaLang/juliaup?tab=readme-ov-file#mac-linux-and-freebsd)).

Then clone this repo, cd into it, and run `julia --project=.`

Then in the julia REPL, type `] instantiate`

Then exit the REPL (ctrl+D) and run `julia --project=. app.jl`

Then open `localhost:8080` in your browser.


## MVP demo

Since this video, I've added a bunch of new features. Try it out for yourself!

[![demo](https://github.com/user-attachments/assets/bd396b1a-2ab0-4276-9488-91c6ee62e3e0)](https://github.com/user-attachments/assets/bd396b1a-2ab0-4276-9488-91c6ee62e3e0)


## To-do:

- Add option to plot iterates of solver instead of central path
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