import { characterFaceUrl, type CharacterType } from '../office/characterMapping.js'

interface Props {
  character: CharacterType
}

export function CockpitScene({ character }: Props) {
  return (
    <div className="start-scene" aria-hidden>
      <div className="start-sky" />
      <div className="start-stars" />
      <div className="start-clouds">
        <span className="start-cloud start-cloud--a" />
        <span className="start-cloud start-cloud--b" />
        <span className="start-cloud start-cloud--c" />
      </div>
      <div className="start-hills">
        <span className="start-hill start-hill--far" />
        <span className="start-hill start-hill--mid" />
        <span className="start-hill start-hill--near" />
      </div>
      <div className="start-floor" />
      <div className="start-mascot">
        <img
          src={characterFaceUrl(character)}
          alt=""
          className="start-mascot-img"
          draggable={false}
        />
        <span className="start-mascot-shadow" />
      </div>
      <div className="start-scanlines" />
      <div className="start-vignette" />
    </div>
  )
}
