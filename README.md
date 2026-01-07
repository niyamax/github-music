# Git Music

Turn your GitHub contributions into music. 🎵

Git Music takes a GitHub username, fetches the contribution history for the last year, and turns regular activity patterns into a musical sequence.

![Git Music Demo](./public/demo.png)

## Features

- **Visualize & Listen**: See your contribution graph light up as it plays notes based on your commit history.
- **Audio Sequencing**: Uses [Tone.js](https://tonejs.github.io/) to synthesize sounds corresponding to contribution levels (0-4).
- **Share**: Generate a shareable link to show off your melodic commit history.
- **Export**: Record and download a `.webm` video of your graph playing.
- **Interactive**: Keyboard shortcuts for playback and control.

## Usage

1. Enter a GitHub username.
2. Press **Enter** or click fetch.
3. Press **Space** or click Play to listen.

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| **Space** | Play / Pause |
| **R** | Start / Stop Recording |
| **S** | Share (Copy Link) |
| **Esc** | Stop |

## Tech Stack

- **React** (Vite)
- **Tone.js** for audio synthesis
- **Axios** for data fetching
- **GitHub Contribution API** (via [github-contributions-api](https://github.com/grubersjoe/github-contributions-api))

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

## License

MIT
