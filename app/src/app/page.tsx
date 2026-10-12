import { ButtonLink } from "@/components/ui/Button";
import { Inspiration } from "@/features/home/Inspiration";

const STEPS = [
  { n: 1, img: "/gallery/thumb-house-2.jpg", pos: "center 35%", title: "Configure the entrance of your dreams", text: "Choose layout, door, glass, colors and hardware in a few simple steps, and see it from outside and inside.", cta: { href: "/configurator", label: "START CREATING" } },
  { n: 2, img: "/gallery/thumb-room-1.jpg", pos: "center",
    title: "Save your design", text: "Save your entrance on this device. Explore several styles and take your time to plan the perfect entrance.", cta: { href: "/designs", label: "MY DESIGNS" } },
  { n: 3, img: "/gallery/thumb-house-3.jpg", pos: "center 45%",
    title: "Share your entrance", text: "Your design is taking shape! Send a link to a friend, a contractor or a retailer to get feedback or a quote.", cta: { href: "/configurator?preset=grand-entry", label: "TRY AN EXAMPLE" } },
];

export default function HomePage() {
  return (
    <>
      <section className="relative mx-3 overflow-hidden rounded-[32px] sm:mx-4 lg:min-h-[calc(100svh-var(--header-h)-24px)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static CC0 sample photo, credits in public/gallery/CREDITS.md */}
        <img src="/gallery/house-1.jpg" alt="A white clapboard house with a covered front door" width={1200} height={904} fetchPriority="high" className="absolute inset-0 size-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
        <div className="relative flex min-h-[560px] items-end p-4 sm:p-8 lg:min-h-[inherit] lg:items-center lg:p-16">
          <div className="anim-rise glass-strong max-w-xl rounded-[32px] p-7 sm:p-10">
            <p className="text-sm font-semibold text-accent">Entrance builder</p>
            <h1 className="mt-2 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Create your door.</h1>
            <p className="mt-5 text-lg leading-relaxed text-ink/80">
              Design every detail in a few steps, then place it on a photo of your own home to see how it looks.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/configurator" size="lg">START CREATING</ButtonLink>
              <ButtonLink href="#inspiration" variant="secondary" size="lg">Get inspired</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-semibold tracking-tight">How it works?</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="glass flex flex-col overflow-hidden rounded-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- static CC0 sample photo */}
              <img src={s.img} alt="" loading="lazy" width={640} height={320} className="h-40 w-full object-cover" style={{ objectPosition: s.pos }} />
              <div className="flex flex-1 flex-col p-6">
              <span className="grid size-10 place-items-center rounded-full bg-brand text-lg font-semibold text-white">{s.n}</span>
              <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 flex-1 text-muted">{s.text}</p>
              <ButtonLink href={s.cta.href} variant="secondary" className="mt-6 self-start">{s.cta.label}</ButtonLink>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="inspiration" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-20 sm:px-6" aria-labelledby="inspire">
        <h2 id="inspire" className="text-3xl font-semibold tracking-tight">Get inspired</h2>
        <p className="mt-2 max-w-2xl text-muted">Not sure where to start? Pick a trendy configuration and make it yours.</p>
        <div className="mt-6"><Inspiration /></div>
      </section>
    </>
  );
}
