export default function BackgroundEffects() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#ffc33a_0%,#ffe45b_18%,#fff7bc_38%,#fffbe2_55%,#fff05a_76%,#ffd22e_100%)]" />
      <div className="absolute inset-0 opacity-[0.34] bg-[repeating-linear-gradient(132deg,transparent_0,transparent_118px,rgba(255,255,255,0.72)_118px,rgba(255,255,255,0.72)_154px,transparent_154px,transparent_252px)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_960px_560px_at_36%_18%,rgba(255,255,255,0.82)_0%,rgba(255,255,255,0.46)_34%,rgba(255,255,255,0)_72%),radial-gradient(ellipse_820px_520px_at_76%_34%,rgba(255,232,55,0.46)_0%,rgba(255,232,55,0.24)_42%,rgba(255,232,55,0)_78%),radial-gradient(ellipse_780px_560px_at_42%_96%,rgba(255,255,255,0.46)_0%,rgba(255,246,151,0.24)_44%,rgba(255,246,151,0)_80%)]" />
      <div className="absolute inset-0 opacity-[0.18] bg-[radial-gradient(rgba(105,72,0,0.52)_1px,transparent_1.25px)] [background-size:40px_40px]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,167,26,0.12)_0%,rgba(255,255,255,0.26)_32%,rgba(255,255,255,0.18)_58%,rgba(255,196,32,0.12)_100%)]" />
    </div>
  );
}
