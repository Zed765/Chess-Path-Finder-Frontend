# Chess Pathfinder (Frontend)

**[🟢 View the Live Demo](https://chess-path-finder-drab.vercel.app/)**

> A React-based interface for setting up arbitrary chess positions and visualizing the shortest valid sequence of moves between them. 

This repository contains the frontend client for the Chess Pathfinder project. It allows users to intuitively construct a starting and target board state via drag-and-drop, validates the positions, and communicates with a custom C++ engine to compute the optimal path. The results are returned and visualized with step-by-step playback.

## Key Features

* **Interactive Board Setup:** Allows user to drag and drop pieces from two side trays to set up the positions
* **State Validation:** Client-side validation ensures legality constraints (e.g., exactly one king per color) before calling the backend
* **FEN Serialization:** Converts visual board states into standard FEN (Forsyth-Edwards Notation) strings for lightweight API payloads
* **Path Playback:** Parses the sequence of UCI moves and FENs returned by the engine, allowing users to step backward and forward through the computed solution

## Tech Stack

**React (Vite) | react-chessboard | Vercel | CSS3**

## Run locally

To run this project locally, you will need Node.js installed and then follow these and the backend instructions

1. **Clone the repository:**
```bash
   git clone https://github.com/yourusername/chess-pathfinder-frontend.git
   cd chess-pathfinder-frontend
```
2. **Install dependencies:**
```bash
  npm install
```
3. **Configure the environment**
   Create a ``.env`` file in the root directory with this in it
```env
VITE_ENGINE_API_URL=http://localhost:10000
```
4. **Run the development server**
```bash
  npm run dev
```
