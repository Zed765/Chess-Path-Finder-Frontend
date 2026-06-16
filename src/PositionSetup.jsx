import { useState } from 'react';
import { Chessboard, ChessboardProvider, SparePiece } from 'react-chessboard';

const WHITE_PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP'];
const BLACK_PIECES = ['bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
const INITIAL_POSITIONS = {
  start: {},
  target: {},
};
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const ENGINE_API_URL = import.meta.env.VITE_ENGINE_API_URL;

function getPositionLabel(positionName) {
  return positionName === 'start' ? 'Starting position' : 'Target position';
}

function pieceTypeToFenPiece(pieceType) {
  const [, pieceName] = pieceType;
  return pieceType.startsWith('w') ? pieceName : pieceName.toLowerCase();
}

function fenPieceToPieceType(piece) {
  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  return `${color}${piece.toUpperCase()}`;
}

function fenToPosition(fen) {
  const [placement] = fen.split(' ');
  const position = {};
  let rankIndex = 0;
  let fileIndex = 0;

  for (const token of placement) {
    if (token === '/') {
      rankIndex += 1;
      fileIndex = 0;
      continue;
    }

    if (Number.isInteger(Number(token))) {
      fileIndex += Number(token);
      continue;
    }

    const square = `${FILES[fileIndex]}${RANKS[rankIndex]}`;
    position[square] = { pieceType: fenPieceToPieceType(token) };
    fileIndex += 1;
  }

  return position;
}

function positionToFen(position) {
  const placement = RANKS.map((rank) => {
    let emptySquares = 0;
    let row = '';

    FILES.forEach((file) => {
      const piece = position[`${file}${rank}`];

      if (!piece) {
        emptySquares += 1;
        return;
      }

      if (emptySquares > 0) {
        row += emptySquares;
        emptySquares = 0;
      }

      row += pieceTypeToFenPiece(piece.pieceType);
    });

    return row + (emptySquares > 0 ? emptySquares : '');
  }).join('/');

  return `${placement} w - - 0 1`;
}

function countKings(position) {
  return Object.values(position).reduce(
    (counts, piece) => {
      if (piece.pieceType === 'wK') {
        counts.white += 1;
      }
      if (piece.pieceType === 'bK') {
        counts.black += 1;
      }

      return counts;
    },
    { white: 0, black: 0 },
  );
}

function getKingValidationMessage(position, label) {
  const kings = countKings(position);
  const totalKings = kings.white + kings.black;

  if (totalKings > 2) {
    return `${label} has too many kings. Use exactly one white king and one black king.`;
  }

  if (kings.white > 1) {
    return `${label} has two white kings. Use one white king and one black king.`;
  }

  if (kings.black > 1) {
    return `${label} has two black kings. Use one white king and one black king.`;
  }

  if (totalKings < 2) {
    return `${label} needs two kings: one white king and one black king.`;
  }

  if (kings.white === 0) {
    return `${label} is missing a white king.`;
  }

  if (kings.black === 0) {
    return `${label} is missing a black king.`;
  }

  return '';
}

function getFirstSetupError(positions) {
  return (
    getKingValidationMessage(positions.start, getPositionLabel('start')) ||
    getKingValidationMessage(positions.target, getPositionLabel('target'))
  );
}

function buildDroppedPosition(position, { piece, sourceSquare, targetSquare }) {
  const nextPosition = { ...position };

  if (!piece.isSparePiece) {
    delete nextPosition[sourceSquare];
  }

  if (targetSquare) {
    nextPosition[targetSquare] = { pieceType: piece.pieceType };
  }

  return nextPosition;
}

function applyUciMove(position, move) {
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const promotion = move[4];
  const movingPiece = position[from];

  if (!movingPiece) {
    return position;
  }

  const nextPosition = { ...position };
  delete nextPosition[from];

  nextPosition[to] = {
    pieceType: promotion
      ? `${movingPiece.pieceType[0]}${promotion.toUpperCase()}`
      : movingPiece.pieceType,
  };

  return nextPosition;
}

function createPlaybackPositions(result, startPosition) {
  if (Array.isArray(result.path) && result.path.length > 0) {
    return result.path.map(fenToPosition);
  }

  if (!Array.isArray(result.moves) || result.moves.length === 0) {
    return [];
  }

  return result.moves.reduce(
    (positions, move) => [...positions, applyUciMove(positions.at(-1), move)],
    [startPosition],
  );
}

function PieceTray({ colorName, pieces }) {
  return (
    <aside className="piece-tray" aria-label={`${colorName} pieces`}>
      <div className="tray-title">{colorName}</div>
      <div className="tray-pieces">
        {pieces.map((pieceType) => (
          <div className="tray-piece" key={pieceType}>
            <SparePiece pieceType={pieceType} />
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function PositionSetup() {
  const [activePosition, setActivePosition] = useState('start');
  const [positions, setPositions] = useState(INITIAL_POSITIONS);
  const [pathStatus, setPathStatus] = useState({
    state: 'idle',
    message: 'Ready to send positions to the engine.',
  });
  const [pathResult, setPathResult] = useState(null);
  const [playbackPositions, setPlaybackPositions] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const currentPosition = positions[activePosition];
  const isPlaybackActive = playbackPositions.length > 0;
  const boardPosition = isPlaybackActive ? playbackPositions[playbackIndex] : currentPosition;
  const activeKingMessage = getKingValidationMessage(
    currentPosition,
    getPositionLabel(activePosition),
  );

  function clearPathPreview() {
    setPathResult(null);
    setPlaybackPositions([]);
    setPlaybackIndex(0);
  }

  function updateCurrentPosition(nextPosition, options = {}) {
    setPositions((previous) => ({
      ...previous,
      [activePosition]:
        typeof nextPosition === 'function'
          ? nextPosition(previous[activePosition])
          : nextPosition,
    }));

    if (!options.keepPathPreview) {
      clearPathPreview();
    }
  }

  function handlePieceDrop(drop) {
    if (isPlaybackActive) {
      return false;
    }

    const nextPosition = buildDroppedPosition(currentPosition, drop);
    const kingMessage = getKingValidationMessage(nextPosition, getPositionLabel(activePosition));

    if (
      kingMessage &&
      (countKings(nextPosition).white > 1 ||
        countKings(nextPosition).black > 1 ||
        countKings(nextPosition).white + countKings(nextPosition).black > 2)
    ) {
      setPathStatus({ state: 'error', message: kingMessage });
      return false;
    }

    updateCurrentPosition(nextPosition);
    setPathStatus({ state: 'idle', message: 'Positions changed. Ready to compute a new path.' });
    return true;
  }

  function handleSquareRightClick({ square }) {
    if (isPlaybackActive) {
      return;
    }

    updateCurrentPosition((previousPosition) => {
      const nextPosition = { ...previousPosition };
      delete nextPosition[square];
      return nextPosition;
    });
  }

  function clearCurrentPosition() {
    updateCurrentPosition({});
    setPathStatus({ state: 'idle', message: 'Position cleared.' });
  }

  function copyStartToTarget() {
    setPositions((previous) => ({
      ...previous,
      target: { ...previous.start },
    }));
    setActivePosition('target');
    clearPathPreview();
    setPathStatus({ state: 'idle', message: 'Starting position copied to target.' });
  }

  async function computePath() {
    const setupError = getFirstSetupError(positions);

    if (setupError) {
      setPathStatus({ state: 'error', message: setupError });
      return;
    }

    const startFen = positionToFen(positions.start);
    const targetFen = positionToFen(positions.target);
    clearPathPreview();

    if (!ENGINE_API_URL) {
      setPathStatus({
        state: 'error',
        message:
          'Add VITE_ENGINE_API_URL to your local .env and Vercel environment variables.',
      });
      return;
    }

    setPathStatus({ state: 'loading', message: 'Asking the engine for a path...' });

    try {
      const response = await fetch(`${ENGINE_API_URL.replace(/\/$/, '')}/compute-path`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startFen, targetFen, maxNodes: 200000 }),
      });

      const responseText = await response.text();
      const result = responseText ? JSON.parse(responseText) : {};

      if (!response.ok || result.error) {
        throw new Error(result.error ?? `Engine responded with ${response.status}`);
      }

      const moves = Array.isArray(result.moves) ? result.moves : [];
      const normalizedResult = { ...result, moves };
      const nextPlaybackPositions = createPlaybackPositions(normalizedResult, positions.start);

      setPathResult(normalizedResult);
      setPlaybackPositions(nextPlaybackPositions);
      setPlaybackIndex(0);
      setPathStatus({
        state: result.found ? 'success' : 'error',
        message: result.found
          ? `Found a path with ${moves.length} move${moves.length === 1 ? '' : 's'}.`
          : 'No path found before the search limit.',
      });
    } catch (error) {
      setPathStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Could not reach the engine.',
      });
    }
  }

  const chessboardOptions = {
    position: currentPosition,
    allowDragging: !isPlaybackActive,
    allowDragOffBoard: true,
    onPieceDrop: handlePieceDrop,
    onSquareRightClick: handleSquareRightClick,
    boardStyle: {
      borderRadius: '8px',
      boxShadow: '0 18px 60px rgba(0, 0, 0, 0.4)',
      overflow: 'hidden',
    },
    darkSquareStyle: { backgroundColor: '#5a6f62' },
    lightSquareStyle: { backgroundColor: '#c7bfa5' },
    dropSquareStyle: { boxShadow: 'inset 0 0 0 4px #d8a84f' },
  };

  return (
    <main className="setup-shell">
      <section className="setup-header">
        <div>
          <p className="eyebrow">Chess Path Finder</p>
          <h1>Build the Starting and Target positions</h1>
        </div>

        <div className="position-switch" aria-label="Position being edited">
          {['start', 'target'].map((positionName) => (
            <button
              className={activePosition === positionName ? 'is-active' : ''}
              key={positionName}
              onClick={() => setActivePosition(positionName)}
              type="button"
            >
              {positionName}
            </button>
          ))}
        </div>
      </section>

      <ChessboardProvider options={{ ...chessboardOptions, position: boardPosition }}>
        <section className="board-workspace">
          <PieceTray colorName="White" pieces={WHITE_PIECES} />

          <div className="board-panel">
            <div className="board-toolbar">
              <span>
                {isPlaybackActive
                  ? `Path preview ${playbackIndex + 1}/${playbackPositions.length}`
                  : getPositionLabel(activePosition)}
              </span>
              <div className="toolbar-actions">
                <button
                  className="primary-action"
                  disabled={pathStatus.state === 'loading'}
                  onClick={computePath}
                  type="button"
                >
                  {pathStatus.state === 'loading' ? 'Computing...' : 'Compute path'}
                </button>
                <button onClick={copyStartToTarget} type="button">
                  Copy start
                </button>
                <button onClick={clearCurrentPosition} type="button">
                  Clear
                </button>
              </div>
            </div>

            {!isPlaybackActive && activeKingMessage && (
              <p className="king-warning">{activeKingMessage}</p>
            )}

            <div className="board-frame">
              <Chessboard />
            </div>

            <p className={`path-status ${pathStatus.state}`}>{pathStatus.message}</p>

            {pathResult?.moves?.length > 0 && (
              <div className="path-result" aria-label="Computed move path">
                <div className="path-result-header">
                  <div className="path-result-title">Move path</div>
                  <div className="playback-actions">
                    <button
                      disabled={playbackIndex === 0}
                      onClick={() => setPlaybackIndex((index) => Math.max(index - 1, 0))}
                      type="button"
                    >
                      Back
                    </button>
                    <button
                      disabled={playbackIndex >= playbackPositions.length - 1}
                      onClick={() =>
                        setPlaybackIndex((index) =>
                          Math.min(index + 1, playbackPositions.length - 1),
                        )
                      }
                      type="button"
                    >
                      Forward
                    </button>
                  </div>
                </div>
                <div className="move-list">
                  {pathResult.moves.map((move, index) => (
                    <span
                      className={index === playbackIndex - 1 ? 'is-current' : ''}
                      key={`${move}-${index}`}
                    >
                      {index + 1}. {move}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <PieceTray colorName="Black" pieces={BLACK_PIECES} />
        </section>
      </ChessboardProvider>
    </main>
  );
}
