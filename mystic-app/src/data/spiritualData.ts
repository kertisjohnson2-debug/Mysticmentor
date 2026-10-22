import { TAROT_INTERPRETATIONS } from "./tarotInterpretations";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TarotCard {
  id: number;
  name: string;
  number: string;
  iconName: string; // Used to select Lucide icons dynamically
  uprightKeywords: string[];
  reversedKeywords: string[];
  uprightMeaning: string;
  reversedMeaning: string;
  description: string;
  advice: string;
  isHidden?: boolean; // Admin visibility toggle support
}

export interface ZodiacSign {
  id: string;
  name: string;
  symbol: string;
  dateRange: string;
  element: "Fire" | "Earth" | "Air" | "Water";
  rulingPlanet: string;
  traits: string[];
  compatibility: string;
  luckyColor: string;
  horoscope: {
    general: string;
    love: string;
    career: string;
    luckyNumber: number;
    luckyTime: string;
    mood: string;
  };
}

export interface NumerologyProfile {
  number: number;
  title: string;
  tagline: string;
  personality: string;
  strengths: string[];
  weaknesses: string[];
  careerPaths: string[];
  compatibility: string;
}

// 22 Detailed Major Arcana Cards
const MAJOR_ARCANA: TarotCard[] = [
  {
    id: 0,
    name: "The Fool",
    number: "0",
    iconName: "Compass",
    uprightKeywords: ["Beginnings", "Freedom", "Spontaneity", "Faith"],
    reversedKeywords: ["Recklessness", "Risk-taking", "Inconsiderate", "Disorder"],
    uprightMeaning: "A symbol of new beginnings, adventures, and clean slates. You are being called to take a leap of faith into the unknown, trusting that the universe will guide your steps.",
    reversedMeaning: "Warning of reckless choices, being naive, or holding back due to fear. You might be acting impulsively without looking at the consequences, or avoiding an exciting new path.",
    description: "A young traveler stands on the edge of a cliff, looking up to the sky with infinite hope, accompanied by a faithful canine companion.",
    advice: "Embrace spontaneity and let go of overthinking. Sometimes, the heart knows the path before the mind can map it out."
  },
  {
    id: 1,
    name: "The Magician",
    number: "I",
    iconName: "Wand2",
    uprightKeywords: ["Manifestation", "Willpower", "Resourceful", "Skill"],
    reversedKeywords: ["Manipulation", "Illusions", "Wasted talent", "Deception"],
    uprightMeaning: "You possess all the tools, skills, and energy required to manifest your deepest desires. Align your willpower with action to turn thoughts into absolute physical reality.",
    reversedMeaning: "Indicates that you may be misusing your power, manipulating situations, or feeling stuck despite having the talent to succeed. Watch out for illusions.",
    description: "Standing before an altar piled with symbols of all tarot suits, a figure points one hand to heaven and the other to earth, channeling cosmic forces.",
    advice: "Focus your intent and take action. The universe is waiting for your signal; do not let your talents lay dormant."
  },
  {
    id: 2,
    name: "The High Priestess",
    number: "II",
    iconName: "Moon",
    uprightKeywords: ["Intuition", "Sacred knowledge", "Subconscious", "Divine feminine"],
    reversedKeywords: ["Secrets", "Ignored intuition", "Surface-level", "Hidden motives"],
    uprightMeaning: "Trust your inner voice. This is a time for quiet reflection, dreams, and tapping into your subconscious wisdom. The answers you seek lie within, not in the external world.",
    reversedMeaning: "You are ignoring your gut feelings, listening to too much external noise, or dealing with hidden secrets that are starting to surface. Slow down and listen.",
    description: "Sitting between two pillars of light and shadow, wearing a crescent crown, she holds a scroll of sacred law.",
    advice: "Meditation and silence will serve you better than aggressive actions today. Let the mysteries unfold in their own time."
  },
  {
    id: 3,
    name: "The Empress",
    number: "III",
    iconName: "Crown",
    uprightKeywords: ["Abundance", "Creativity", "Fertility", "Nature"],
    reversedKeywords: ["Creative block", "Dependence", "Smothering", "Lack of growth"],
    uprightMeaning: "The ultimate card of nurture, creativity, and luxury. You are entering a period of abundant growth, beautiful artistic expression, and strong connection to nature and sensuality.",
    reversedMeaning: "Points to a block in your creative energy, feelings of codependency, or neglecting your self-care. You may be pouring too much into others and draining yourself.",
    description: "A majestic queen sits in a field of golden wheat, surrounded by luxury forests and streams, wearing a crown of stars.",
    advice: "Treat yourself with kindness and ground yourself in nature. Create something beautiful today without worrying about perfection."
  },
  {
    id: 4,
    name: "The Emperor",
    number: "IV",
    iconName: "Shield",
    uprightKeywords: ["Authority", "Structure", "Solid foundation", "Protection"],
    reversedKeywords: ["Rigidity", "Control freak", "Inefficiency", "Weakness"],
    uprightMeaning: "Establish order, structure, and solid boundaries. You are in a position of authority and must act with discipline, logic, and protective strength to secure your goals.",
    reversedMeaning: "Reflects an overbearing attitude, rigid control that suffocates progress, or a complete lack of discipline that is causing chaos in your environment.",
    description: "An elder ruler sits on a massive stone throne carved with rams' heads, holding an imperial scepter under a fiery sky.",
    advice: "Create a structured plan and stick to it. Discipline is not a restriction, but the scaffold of your eventual freedom."
  },
  {
    id: 5,
    name: "The Hierophant",
    number: "V",
    iconName: "BookOpen",
    uprightKeywords: ["Spiritual wisdom", "Tradition", "Institutions", "Mentorship"],
    reversedKeywords: ["Rebellion", "Unconventional", "Dogma", "New paths"],
    uprightMeaning: "Seeking spiritual guidance, traditional wisdom, or structured learning. It is a time to honor helpful customs, seek mentors, and study established systems of knowledge.",
    reversedMeaning: "A powerful sign of rebellion, questioning old paradigms, and forging your own highly personal, unconventional spiritual path away from rigid dogma.",
    description: "A sacred teacher raises two fingers in blessing over acolytes, seated before tall temple columns with keys of wisdom at his feet.",
    advice: "Learn the rules thoroughly before you seek to break them. There is timeless value in structure, but your soul must remain free."
  },
  {
    id: 6,
    name: "The Lovers",
    number: "VI",
    iconName: "Heart",
    uprightKeywords: ["Harmony", "Relationships", "Alignment", "Choices"],
    reversedKeywords: ["Disharmony", "Misalignment", "Inner conflict", "Bad choices"],
    uprightMeaning: "Represents deep connection, shared values, and major choices regarding relationships. It signals a beautiful alignment of mind, body, and soul with a person or path.",
    reversedMeaning: "Indicates a period of disharmony, self-doubt, or misalignment with a partner. You may be facing a difficult choice where your values are in conflict.",
    description: "Two figures stand blessed by an angel in an abundant garden, a fiery tree of knowledge rising in the background.",
    advice: "Ensure your choices align with your true core values rather than seeking temporary convenience or superficial approval."
  },
  {
    id: 7,
    name: "The Chariot",
    number: "VII",
    iconName: "Sparkles",
    uprightKeywords: ["Willpower", "Victory", "Determination", "Control"],
    reversedKeywords: ["Lack of control", "Aggression", "Obstacles", "Loss of direction"],
    uprightMeaning: "Success is yours through sheer willpower, focus, and self-mastery. Harness opposing forces and steer them in a single, unyielding direction toward victory.",
    reversedMeaning: "You are losing your grip on direction, feeling pulled in too many ways, or suffering from uncontrolled aggression and roadblocks. Regroup and recalibrate.",
    description: "A brave warrior drives a chariot drawn by two contrasting black and white sphinxes, moving forward under a canopy of stars.",
    advice: "Stay focused on the finish line. Do not let distractions or minor conflicts throw you off your designated path."
  },
  {
    id: 8,
    name: "Strength",
    number: "VIII",
    iconName: "Activity",
    uprightKeywords: ["Courage", "Inner power", "Patience", "Compassion"],
    reversedKeywords: ["Self-doubt", "Raw emotion", "Weakness", "Insecurity"],
    uprightMeaning: "True power comes not from brute force, but from quiet courage, patience, and gentle persuasion. You can calm any storm and tame any wild situation with compassion.",
    reversedMeaning: "Suggests you are letting fear, self-doubt, or raw, unbridled emotion take the wheel. You may feel weak or inadequate; remember your quiet internal strength.",
    description: "A serene woman crowned with flowers gently and fearlessly closes the jaws of a fierce golden lion under an infinity symbol.",
    advice: "Approach difficulties with soft diplomacy and empathy rather than aggression. Love is the strongest shield you possess."
  },
  {
    id: 9,
    name: "The Hermit",
    number: "IX",
    iconName: "Eye",
    uprightKeywords: ["Soul searching", "Inner guidance", "Solitude", "Wisdom"],
    reversedKeywords: ["Loneliness", "Isolation", "Paranoia", "Withdrawal"],
    uprightMeaning: "A calling to retreat into temporary solitude, seek answers within, and focus on self-discovery. Shine your light inward to illuminate your path.",
    reversedMeaning: "Warning that your solitude is turning into toxic isolation, or that you are refusing to reflect on your actions, drifting into loneliness or paranoia.",
    description: "Standing alone on a snow-capped peak in the dark of night, an elder traveler holds a single lantern containing a six-pointed star.",
    advice: "Unplug from social demands and take a moment of quiet introspection. The noise of others is drowning out your inner light."
  },
  {
    id: 10,
    name: "Wheel of Fortune",
    number: "X",
    iconName: "RefreshCw",
    uprightKeywords: ["Destiny", "Good luck", "Turning point", "Karma"],
    reversedKeywords: ["Bad luck", "Resisting change", "Breaking cycles", "Chaotic forces"],
    uprightMeaning: "Life is constantly moving in cycles. A sudden turn of events, positive luck, or destined encounter is coming. Trust that this shift is aligned with your destiny.",
    reversedMeaning: "Signals an unwelcome change or a series of bad luck that feels out of control. It is a powerful reminder to break old habits and stop resisting inevitable flows.",
    description: "A great bronze wheel inscribed with mysterious letters revolves in the clouds, surrounded by winged mythological figures.",
    advice: "This too shall pass. Whether you are on top of the wheel or at the bottom, remember that change is the only true constant."
  },
  {
    id: 11,
    name: "Justice",
    number: "XI",
    iconName: "Scale",
    uprightKeywords: ["Truth", "Fairness", "Accountability", "Law"],
    reversedKeywords: ["Dishonesty", "Unfairness", "Denial", "Unaccountability"],
    uprightMeaning: "Truth, fairness, and cause-and-effect rule this period. Your past decisions have led to this moment. Justice will prevail, and clarity will be achieved.",
    reversedMeaning: "Indicates bias, unfair treatment, or a refusal to take accountability for your part in a situation. You may be trying to escape consequences.",
    description: "Seated in front of a heavy crimson veil, she holds a double-edged sword upright in one hand and a scale balanced perfectly in the other.",
    advice: "Be completely honest with yourself and others. Own your choices, and act with absolute integrity to maintain harmony."
  },
  {
    id: 12,
    name: "The Hanged Man",
    number: "XII",
    iconName: "Anchor",
    uprightKeywords: ["Pause", "Surrender", "Letting go", "New perspective"],
    reversedKeywords: ["Stalling", "Resistance", "Wasted effort", "Sacrifice"],
    uprightMeaning: "You are being asked to pause, surrender to the present moment, and let go of control. A shift in perspective is occurring, allowing you to see things upside-down.",
    reversedMeaning: "You are resisting the pause, trying to force actions when you should be waiting, or making unnecessary sacrifices that do not lead to growth.",
    description: "Suspended upside-down from a living wooden T-shaped cross by one foot, his face is completely calm, haloed in golden light.",
    advice: "Stop struggling against the current. Surrender to the delay and look at your problems from a completely different angle."
  },
  {
    id: 13,
    name: "Death",
    number: "XIII",
    iconName: "Skull",
    uprightKeywords: ["Endings", "Transformation", "Transition", "Purging"],
    reversedKeywords: ["Resistance to change", "Decay", "Stagnation", "Fear"],
    uprightMeaning: "A major chapter of your life is coming to a natural, inevitable end. This is not physical death, but a powerful transformation to make room for new growth.",
    reversedMeaning: "You are desperately holding on to a dead situation, relationship, or belief. Stagnation is setting in because you fear letting go of the familiar.",
    description: "A skeleton knight in dark armor rides a white horse, bearing a black banner emblazoned with a white mystic rose as the sun sets.",
    advice: "Do not fear endings. Every beautiful sunrise requires the complete death of the night that preceded it."
  },
  {
    id: 14,
    name: "Temperance",
    number: "XIV",
    iconName: "RefreshCw",
    uprightKeywords: ["Balance", "Moderation", "Patience", "Purpose"],
    reversedKeywords: ["Imbalance", "Excess", "Self-healing", "Clashing"],
    uprightMeaning: "A calling to bring balance, moderation, and peaceful alchemy to your life. You are learning to reconcile opposing views and coordinate contrasting forces with patience.",
    reversedMeaning: "Indicates an immediate imbalance, over-indulgence, or clashing coordinates. You are forcing elements together that do not harmoniously merge.",
    description: "A winged celestial being stands with one foot on water and one on land, pouring liquid flows of light between two golden cups.",
    advice: "Practice peaceful compromise. Avoid extreme behaviors and find the comfortable middle ground of your current path."
  },
  {
    id: 15,
    name: "The Devil",
    number: "XV",
    iconName: "Flame",
    uprightKeywords: ["Attachment", "Addiction", "Shadow Self", "Materialism"],
    reversedKeywords: ["Releasing beliefs", "Detachment", "Reclaiming power", "Freedom"],
    uprightMeaning: "Points to self-imposed boundaries, shadow behaviors, and codependent chains. You may be letting immediate physical desires or fears block your higher spiritual path.",
    reversedMeaning: "A powerful trigger of spiritual awakening. You are identifying limiting self-beliefs, breaking codependent loops, and releasing heavy physical attachments.",
    description: "A dark horned figure sits on a black stone pedestal, two figures bound loosely to his base by light iron chains.",
    advice: "Acknowledge your shadow without judgment. You are only as bound as you believe yourself to be; the chains are fully removable."
  },
  {
    id: 16,
    name: "The Tower",
    number: "XVI",
    iconName: "Skull",
    uprightKeywords: ["Sudden Upheaval", "Chaos", "Revelation", "Breakthrough"],
    reversedKeywords: ["Avoiding disaster", "Fear of change", "Stagnation", "Delays"],
    uprightMeaning: "Expect a sudden, unexpected shift or revelation. False foundations are being shattered by a bolt of cosmic lightning to reveal your absolute core truth.",
    reversedMeaning: "You are sensing an inevitable, necessary shift but are desperately trying to delay the collapse, prolonging stagnation at the cost of your evolution.",
    description: "A tall stone tower built on a high peak is struck by golden lightning, its crown-shaped dome displaced amidst clouds of dust.",
    advice: "Do not fight the collapse of things that were built on false pretenses. Let the old wall crumble so you can construct on honest bedrock."
  },
  {
    id: 17,
    name: "The Star",
    number: "XVII",
    iconName: "Sparkles",
    uprightKeywords: ["Hope", "Faith", "Rejuvenation", "Serenity"],
    reversedKeywords: ["Despair", "Lack of faith", "Discouragement", "Insecurity"],
    uprightMeaning: "A period of healing, renewed hope, and divine inspiration is washed over you. The universe is sending comforting blessings, reassuring you that you are protected.",
    reversedMeaning: "You are feeling discouraged, disconnected from your faith, and spiritually exhausted. You may feel like the stars are hidden; they are still shining.",
    description: "Under a giant brilliant eight-pointed star, a naked maiden pours refreshing water onto the soil and into a crystal pool.",
    advice: "Allow yourself to heal. Pour your energy into restorative practices and trust that your hope is fully justified."
  },
  {
    id: 18,
    name: "The Moon",
    number: "XVIII",
    iconName: "MoonStar",
    uprightKeywords: ["Illusion", "Anxiety", "Intuition", "Subconscious"],
    reversedKeywords: ["Release of fear", "Truth revealed", "Clarity", "Deception exposed"],
    uprightMeaning: "Things are not entirely as they seem. Fears, illusions, and anxieties are being projected. Rely on your deepest intuition to guide you through the fog.",
    reversedMeaning: "The fog is lifting, truth is being revealed, and fears are dissolving. You are gaining clarity on a complex, deceptive situation.",
    description: "A path winds between two stone towers under a full glowing moon, with a wild wolf and a dog howling, and a lobster climbing from a pool.",
    advice: "Do not make major physical decisions based on fear or incomplete information. Sleep on it and let your intuition guide you."
  },
  {
    id: 19,
    name: "The Sun",
    number: "XIX",
    iconName: "Sun",
    uprightKeywords: ["Success", "Joy", "Vitality", "Truth"],
    reversedKeywords: ["Temporary sadness", "Clouded joy", "Ego", "Unrealistic outlook"],
    uprightMeaning: "The most positive card in the deck. Abundant joy, incredible vitality, warmth, success, and brilliant clarity are yours. Your light shines brightly for all to see.",
    reversedMeaning: "Your joy is slightly clouded, or you are experiencing temporary setback. You might also be suffering from over-inflated ego or unrealistic expectations.",
    description: "A radiant child rides a white horse through a field of sunflowers, under a massive, glowing, benevolent sun.",
    advice: "Celebrate your wins and spread warmth. Your positive energy is infectious and has the power to heal those around you."
  },
  {
    id: 20,
    name: "Judgement",
    number: "XX",
    iconName: "BookOpen",
    uprightKeywords: ["Awakening", "Reflection", "Reckoning", "Calling"],
    reversedKeywords: ["Self-doubt", "Inner critic", "Ignoring calling", "Stalling"],
    uprightMeaning: "You are experiencing a spiritual calling or personal awakening. Reflect on your choices, integrate your past experiences, and rise to your next octave of evolution.",
    reversedMeaning: "You are hearing the call to transform but are blocking it with excessive self-criticism, over-analysis, or fear of stepping into your true authority.",
    description: "An angelic figure with golden wings sounds a trumpet, as figures rise from stone vaults below, raising their arms in absolute surrender.",
    advice: "Forgive your past mistakes and make a definitive decision. The path of transformation requires you to shed old skin."
  },
  {
    id: 21,
    name: "The World",
    number: "XXI",
    iconName: "Compass",
    uprightKeywords: ["Completion", "Integration", "Achievement", "Travel"],
    reversedKeywords: ["Lack of closure", "Shortcuts", "Unfinished cycles", "Delay"],
    uprightMeaning: "The absolute completion of a major chapter. You have successfully integrated all aspects of this cycle, achieving wisdom, integration, and beautiful personal wholeness.",
    reversedMeaning: "You are nearing a major milestone but are struggling with lack of closure or seeking hasty shortcuts. Do not leave the final loose ends untied.",
    description: "A central figure floats inside a great laurel wreath, surrounded by symbolic representations of the four elements in each corner of the heavens.",
    advice: "Celebrate your journey and tie up all remaining details. You have learned this chapter's lessons; prepare for the next loop."
  }
];

const MINOR_ARCANA: TarotCard[] = [
  { id: 22, name: "Ace of Wands", number: "Ace", iconName: "Flame", uprightKeywords: ["Inspiration", "Initiative", "Creative spark"], reversedKeywords: ["Delay", "Scattered energy", "False start"], uprightMeaning: "A vivid idea or desire is ready to become action. This is the beginning of a creative venture, an energetic new chapter, or a renewed sense of purpose.", reversedMeaning: "Your enthusiasm may be blocked, unfocused, or spent on too many beginnings. A promising idea needs patience and a clear first step before it can grow.", description: "A surge of creative life is arriving; the opportunity is real, but it needs your willingness to begin.", advice: "Choose one idea that excites you and take a concrete first step today." },
  { id: 23, name: "Two of Wands", number: "Two", iconName: "Flame", uprightKeywords: ["Planning", "Expansion", "Personal power"], reversedKeywords: ["Fear of change", "Poor planning", "Playing small"], uprightMeaning: "You have established a foothold and can now look beyond what is familiar. A larger ambition is within reach if you weigh your options and plan deliberately.", reversedMeaning: "Fear of uncertainty or incomplete preparation is keeping your plans small. You may be waiting for guarantees that no meaningful venture can offer.", description: "A moment of choice asks you to look past present success toward the wider path you want to build.", advice: "Set a clear goal for the next stage and identify the first practical move toward it." },
  { id: 24, name: "Three of Wands", number: "Three", iconName: "Flame", uprightKeywords: ["Progress", "Foresight", "Opportunity"], reversedKeywords: ["Delays", "Obstacles", "Unrealistic plans"], uprightMeaning: "Your early efforts are opening doors. Progress may come through collaboration, travel, or opportunities beyond your usual circle; keep your attention on the long view.", reversedMeaning: "Plans are moving more slowly than expected, or you have overlooked practical obstacles. Reassess the route without abandoning the larger purpose.", description: "The first results are appearing, inviting you to broaden your reach and prepare for what comes next.", advice: "Check your timelines and dependencies, then make one useful connection that supports your goal." },
  { id: 25, name: "Four of Wands", number: "Four", iconName: "Flame", uprightKeywords: ["Celebration", "Belonging", "Stability"], reversedKeywords: ["Tension", "Instability", "Delayed celebration"], uprightMeaning: "A milestone deserves recognition. Shared effort is creating a stable, welcoming foundation, and time with your community can restore your sense of joy and belonging.", reversedMeaning: "A home, team, or celebration may feel unsettled, or a happy moment is delayed. Name the tension and tend to the relationships that make stability possible.", description: "A hard-won milestone brings people together and offers a welcome pause to appreciate what has been built.", advice: "Mark your progress with the people who helped you reach it, even in a small way." },
  { id: 26, name: "Five of Wands", number: "Five", iconName: "Flame", uprightKeywords: ["Competition", "Clashing ideas", "Challenge"], reversedKeywords: ["Avoidance", "Resolution", "Inner conflict"], uprightMeaning: "Different ambitions or opinions are competing for space. This friction can sharpen your ideas, but only if you keep the contest focused on the issue rather than turning it personal.", reversedMeaning: "Conflict may be easing, or important disagreement is being avoided until resentment builds. Decide whether peace requires a conversation or a firm boundary.", description: "A crowded field of competing energies tests how you handle disagreement and assert your place.", advice: "State your position calmly, listen for the useful point in another view, and avoid needless escalation." },
  { id: 27, name: "Six of Wands", number: "Six", iconName: "Flame", uprightKeywords: ["Recognition", "Confidence", "Achievement"], reversedKeywords: ["Self-doubt", "Unseen effort", "Ego"], uprightMeaning: "Your persistence is earning recognition, support, or a clear win. Let success strengthen your confidence while remembering the people and work that helped you get here.", reversedMeaning: "You may feel overlooked, doubt your progress, or rely too heavily on approval. A delayed acknowledgment does not erase the value of what you have accomplished.", description: "A visible success renews confidence and shows how steady effort can inspire others.", advice: "Acknowledge your contribution without waiting for everyone else to do it first." },
  { id: 28, name: "Seven of Wands", number: "Seven", iconName: "Flame", uprightKeywords: ["Courage", "Boundaries", "Perseverance"], reversedKeywords: ["Exhaustion", "Overwhelm", "Giving in"], uprightMeaning: "You have earned your position and may need to defend it against pressure or competing demands. Hold your ground, but choose the challenges that truly matter.", reversedMeaning: "Constantly defending yourself is draining your strength. You may be overwhelmed, or treating every disagreement as a threat when some demands can be released.", description: "A test of conviction asks you to protect your hard-won ground without losing sight of your limits.", advice: "Name the boundary you need and conserve your energy for the issue that matters most." },
  { id: 29, name: "Eight of Wands", number: "Eight", iconName: "Flame", uprightKeywords: ["Momentum", "Swift progress", "Communication"], reversedKeywords: ["Delays", "Miscommunication", "Scattered effort"], uprightMeaning: "Events are accelerating. News, decisions, or travel may arrive quickly, and several pieces of a plan can finally move forward together.", reversedMeaning: "Momentum is disrupted by delays, crossed messages, or too many tasks competing for attention. Slow down enough to confirm details before reacting.", description: "A fast-moving opening carries plans forward and rewards clear, timely communication.", advice: "Answer the important message, confirm the next step, and let less urgent distractions wait." },
  { id: 30, name: "Nine of Wands", number: "Nine", iconName: "Flame", uprightKeywords: ["Resilience", "Caution", "Persistence"], reversedKeywords: ["Fatigue", "Defensiveness", "Giving up"], uprightMeaning: "You have survived a demanding stretch and are wiser for it. One more effort may be needed, but experience can help you protect your progress without expecting trouble everywhere.", reversedMeaning: "Weariness is making you either overly guarded or ready to abandon a goal. Rest and reassess before deciding whether another effort is worthwhile.", description: "Near the finish, hard-earned resilience meets the need for sensible protection and recovery.", advice: "Take a real pause, then decide which commitment still deserves your strength." },
  { id: 31, name: "Ten of Wands", number: "Ten", iconName: "Flame", uprightKeywords: ["Responsibility", "Burden", "Completion"], reversedKeywords: ["Overload", "Delegation", "Release"], uprightMeaning: "You are carrying many responsibilities to bring an important effort to completion. The goal may be close, but the weight is a sign to review what can be shared or simplified.", reversedMeaning: "Overcommitment has become unsustainable, or you are ready to release burdens that were never yours alone. Delegating is not a failure of dedication.", description: "A heavy workload approaches its endpoint, revealing the cost of trying to carry everything yourself.", advice: "List what must be done, delegate one task, and set down one obligation that can wait." },
  { id: 32, name: "Page of Wands", number: "Page", iconName: "Flame", uprightKeywords: ["Curiosity", "Discovery", "Creative news"], reversedKeywords: ["Immaturity", "False starts", "Hesitation"], uprightMeaning: "A fresh interest, invitation, or idea awakens your curiosity. You do not need mastery yet; exploration and an open mind will teach you what deserves commitment.", reversedMeaning: "Excitement may be fading before an idea gets a fair chance, or enthusiasm is running ahead of preparation. Turn inspiration into a small, testable effort.", description: "A curious messenger brings a spark of possibility and the courage to explore unfamiliar territory.", advice: "Try the idea in a modest, low-risk way and notice what you learn." },
  { id: 33, name: "Knight of Wands", number: "Knight", iconName: "Flame", uprightKeywords: ["Bold action", "Adventure", "Passion"], reversedKeywords: ["Impulsiveness", "Restlessness", "Burnout"], uprightMeaning: "Passion and confidence make decisive action possible. A bold change, journey, or project can energize you when you commit wholeheartedly and accept responsibility for the consequences.", reversedMeaning: "Restlessness can turn into haste, inconsistency, or promises made in the heat of the moment. Slow your pace enough to finish what you start.", description: "A spirited drive pushes toward adventure, but lasting progress needs direction as well as courage.", advice: "Choose a destination before you accelerate, and keep one promise you have already made." },
  { id: 34, name: "Queen of Wands", number: "Queen", iconName: "Flame", uprightKeywords: ["Confidence", "Warmth", "Magnetism"], reversedKeywords: ["Insecurity", "Jealousy", "Overextension"], uprightMeaning: "You can lead through warmth, confidence, and wholehearted creativity. Your presence encourages others, while healthy self-belief lets you take up space without apology.", reversedMeaning: "Self-doubt, comparison, or jealousy may be dimming your natural confidence. You may also be giving so much outwardly that your own needs are neglected.", description: "Creative confidence and generous warmth make you a source of encouragement and decisive energy.", advice: "Share your idea boldly, and reserve time for something that restores your own enthusiasm." },
  { id: 35, name: "King of Wands", number: "King", iconName: "Flame", uprightKeywords: ["Vision", "Leadership", "Enterprise"], reversedKeywords: ["Domination", "Impulsiveness", "Unrealistic ambition"], uprightMeaning: "A compelling vision can become a lasting enterprise through courage, experience, and responsible leadership. Inspire people with direction, then give them room to contribute.", reversedMeaning: "Ambition may be turning into domination, or a grand plan lacks the patience and follow-through it needs. Leadership is weakened when others are treated as instruments.", description: "Mature creative force turns an ambitious vision into shared direction and purposeful action.", advice: "Set a clear priority, explain why it matters, and invite others to shape the work." },
  { id: 36, name: "Ace of Cups", number: "Ace", iconName: "Heart", uprightKeywords: ["Emotional renewal", "Love", "Compassion"], reversedKeywords: ["Blocked feelings", "Emotional depletion", "Self-neglect"], uprightMeaning: "A new emotional connection, creative opening, or wave of compassion is available. Let yourself receive care as readily as you offer it.", reversedMeaning: "Feelings may be held back or depleted after giving too much. Reconnection begins by acknowledging what you need instead of pretending you are unaffected.", description: "An open heart makes room for affection, healing, inspiration, and a more honest emotional beginning.", advice: "Make space for one sincere conversation or one act of care directed toward yourself." },
  { id: 37, name: "Two of Cups", number: "Two", iconName: "Heart", uprightKeywords: ["Mutuality", "Partnership", "Respect"], reversedKeywords: ["Imbalance", "Misunderstanding", "Disconnection"], uprightMeaning: "A bond grows through mutual respect, honest exchange, and shared willingness. This may mark a loving partnership, a sincere friendship, or a productive alliance.", reversedMeaning: "A relationship may feel unequal or strained by unspoken expectations. Restoring connection requires both people to name their needs and listen fairly.", description: "Two people meet as equals, creating trust through openness rather than assumption.", advice: "Say what you value in the relationship and ask directly for what would make it more balanced." },
  { id: 38, name: "Three of Cups", number: "Three", iconName: "Heart", uprightKeywords: ["Friendship", "Celebration", "Community"], reversedKeywords: ["Excess", "Gossip", "Social distance"], uprightMeaning: "Friendship and community offer genuine support. A gathering, shared achievement, or joyful exchange reminds you that celebration is richer when it is shared.", reversedMeaning: "Social plans may feel excessive or leave someone on the margins. Gossip, overindulgence, or shallow connection can distract from the friendships that matter.", description: "A moment of shared joy strengthens friendship and reminds you to celebrate together.", advice: "Reach out to someone whose company leaves you feeling supported, not depleted." },
  { id: 39, name: "Four of Cups", number: "Four", iconName: "Heart", uprightKeywords: ["Contemplation", "Apathy", "Reassessment"], reversedKeywords: ["Renewed interest", "Awareness", "Re-engagement"], uprightMeaning: "You may be emotionally withdrawn or dissatisfied, even while an option is available. A pause can clarify what is missing, but do not dismiss an offer before considering it.", reversedMeaning: "Your attention is returning to life after a period of disinterest. You are more willing to notice an opportunity or accept support that previously passed unseen.", description: "A quiet spell of dissatisfaction calls for reflection without letting temporary apathy close every door.", advice: "Name what feels unfulfilling, then give one overlooked possibility an honest look." },
  { id: 40, name: "Five of Cups", number: "Five", iconName: "Heart", uprightKeywords: ["Grief", "Regret", "Perspective"], reversedKeywords: ["Acceptance", "Recovery", "Renewed hope"], uprightMeaning: "Loss or disappointment deserves to be mourned, but it is not the whole story. Some support and possibility remain, even if grief currently makes them hard to see.", reversedMeaning: "You are beginning to accept what cannot be changed and reclaim attention for what remains. Healing does not erase loss; it lets life widen around it.", description: "Sorrow is real, yet the path forward still holds relationships and possibilities worth turning toward.", advice: "Allow yourself to grieve, then contact one person or resource that can support you now." },
  { id: 41, name: "Six of Cups", number: "Six", iconName: "Heart", uprightKeywords: ["Nostalgia", "Kindness", "Reconnection"], reversedKeywords: ["Living in the past", "Idealization", "Growing up"], uprightMeaning: "A memory, familiar bond, or simple act of kindness brings warmth. The past can remind you of what matters when you carry its lessons forward rather than expecting it to return unchanged.", reversedMeaning: "Nostalgia may idealize an old relationship or keep you tied to a chapter that has ended. Growth asks you to honor the memory while responding to the present.", description: "A tender connection to the past offers comfort, generosity, and a reminder of uncomplicated joy.", advice: "Reconnect kindly if it is healthy, but make choices based on who everyone is today." },
  { id: 42, name: "Seven of Cups", number: "Seven", iconName: "Heart", uprightKeywords: ["Choices", "Imagination", "Discernment"], reversedKeywords: ["Clarity", "Overwhelm", "Wishful thinking"], uprightMeaning: "Many possibilities are competing for your attention, and imagination is powerful. Some options are alluring but unrealistic, so distinguish a genuine opportunity from a passing fantasy.", reversedMeaning: "Confusion is beginning to clear, or too many choices have become paralyzing. Focus on what is feasible and aligned with your actual priorities.", description: "A field of tempting possibilities calls for discernment before desire turns into commitment.", advice: "Write down what each option requires in real terms, then eliminate the one that conflicts with your priorities." },
  { id: 43, name: "Eight of Cups", number: "Eight", iconName: "Heart", uprightKeywords: ["Departure", "Seeking meaning", "Courage"], reversedKeywords: ["Fear of leaving", "Drifting", "Return"], uprightMeaning: "Something that once mattered no longer offers the depth you need. Leaving may be difficult, but a sincere search for meaning is wiser than staying only because the familiar is comfortable.", reversedMeaning: "You may know a chapter is over yet hesitate to leave, or drift away without deciding what you want next. Examine whether staying is devotion or fear.", description: "A deliberate departure makes room for a deeper purpose when an old arrangement has run its course.", advice: "Identify what you are seeking, and make one practical plan for moving toward it." },
  { id: 44, name: "Nine of Cups", number: "Nine", iconName: "Heart", uprightKeywords: ["Satisfaction", "Gratitude", "Enjoyment"], reversedKeywords: ["Indulgence", "Dissatisfaction", "Hollow pleasure"], uprightMeaning: "A wish, personal goal, or period of comfort brings real satisfaction. Enjoy what you have achieved while staying connected to gratitude and to the people around you.", reversedMeaning: "Pleasure may be covering a deeper dissatisfaction, or indulgence is leaving you less fulfilled than expected. Revisit what contentment means beyond appearances.", description: "A well-earned moment of ease invites appreciation without mistaking comfort for lasting fulfillment.", advice: "Enjoy a genuine pleasure today, and notice whether it meets the need you actually have." },
  { id: 45, name: "Ten of Cups", number: "Ten", iconName: "Heart", uprightKeywords: ["Belonging", "Emotional harmony", "Shared joy"], reversedKeywords: ["Family tension", "Unrealistic ideals", "Disconnection"], uprightMeaning: "Emotional fulfillment grows through belonging, trust, and shared care. This card points to a supportive home or community, not perfection, but people willing to build harmony together.", reversedMeaning: "Tension or incompatible expectations may disturb the sense of togetherness. An ideal image of family or happiness can prevent an honest conversation about what everyone needs.", description: "A loving community creates a durable sense of home through care, acceptance, and shared values.", advice: "Ask one person close to you what would help everyone feel more heard and included." },
  { id: 46, name: "Page of Cups", number: "Page", iconName: "Heart", uprightKeywords: ["Sensitivity", "Creative message", "Emotional openness"], reversedKeywords: ["Emotional immaturity", "Insecurity", "Creative block"], uprightMeaning: "A gentle message, new affection, or imaginative insight invites emotional openness. Curiosity and kindness can help you explore feelings without needing to have them all figured out.", reversedMeaning: "Insecurity may make it hard to express feelings clearly, or sensitivity is turning into avoidance and fantasy. Ground your emotions before responding.", description: "A tender invitation encourages creative expression and a more honest relationship with your feelings.", advice: "Share one feeling plainly, without disguising it as a joke or expecting someone to guess." },
  { id: 47, name: "Knight of Cups", number: "Knight", iconName: "Heart", uprightKeywords: ["Romance", "Idealism", "Invitation"], reversedKeywords: ["Moodiness", "Unrealistic promises", "Disappointment"], uprightMeaning: "An invitation, heartfelt gesture, or creative pursuit is guided by imagination and emotional sincerity. Follow what inspires you while keeping your expectations connected to reality.", reversedMeaning: "Romantic ideals or shifting moods may obscure what someone can actually offer. Beautiful words need to be matched by consistent, respectful actions.", description: "A sincere offer carries emotional promise, but its value is shown by care that continues beyond the moment.", advice: "Welcome the invitation, then take time to see whether actions support the promise." },
  { id: 48, name: "Queen of Cups", number: "Queen", iconName: "Heart", uprightKeywords: ["Compassion", "Intuition", "Emotional wisdom"], reversedKeywords: ["Poor boundaries", "Emotional overwhelm", "Withdrawal"], uprightMeaning: "Your empathy and intuition can meet a difficult situation with care. Emotional wisdom includes understanding others while remaining attentive to your own boundaries and needs.", reversedMeaning: "You may be absorbing other people's feelings, ignoring your own needs, or withdrawing to avoid being overwhelmed. Compassion needs boundaries to remain sustainable.", description: "Deep feeling and intuitive understanding offer comfort when balanced with clear emotional limits.", advice: "Before helping, ask what support is wanted and decide what you can genuinely give." },
  { id: 49, name: "King of Cups", number: "King", iconName: "Heart", uprightKeywords: ["Emotional balance", "Diplomacy", "Steadiness"], reversedKeywords: ["Manipulation", "Suppression", "Volatility"], uprightMeaning: "You can remain compassionate and composed even when emotions run high. Mature leadership here means acknowledging feelings without letting them dictate unfair or impulsive choices.", reversedMeaning: "Emotions may be suppressed until they spill out, or influence is being used to manipulate others. Calmness is not the same as honesty if important feelings remain unspoken.", description: "Steady emotional leadership holds compassion and clear judgment together in unsettled waters.", advice: "Pause before reacting, then state your feeling and your boundary without blame." },
  { id: 50, name: "Ace of Swords", number: "Ace", iconName: "Shield", uprightKeywords: ["Clarity", "Truth", "Breakthrough"], reversedKeywords: ["Confusion", "Misinformation", "Poor judgment"], uprightMeaning: "A clear insight or honest conversation cuts through uncertainty. You have an opportunity to make a sound decision, set a truthful boundary, or begin a plan with a sharper understanding.", reversedMeaning: "Conflicting information or hurried thinking is clouding the issue. A decision made before the facts are clear could create avoidable trouble.", description: "A clean moment of insight makes it possible to name the truth and choose a direct path.", advice: "Verify the facts, write down the central question, and address it plainly." },
  { id: 51, name: "Two of Swords", number: "Two", iconName: "Shield", uprightKeywords: ["Difficult choice", "Stalemate", "Balance"], reversedKeywords: ["Truth emerging", "Overwhelm", "Indecision"], uprightMeaning: "You may be holding two competing options in balance while avoiding information that could make the choice real. A pause is useful, but indefinite stalemate is not resolution.", reversedMeaning: "The truth you have postponed is surfacing, or too much pressure is making it difficult to think clearly. Reduce the noise and face the decision one fact at a time.", description: "A guarded pause between alternatives asks for honest attention rather than a decision made in fear.", advice: "Write down what you know, what you are avoiding, and when you will decide." },
  { id: 52, name: "Three of Swords", number: "Three", iconName: "Shield", uprightKeywords: ["Heartbreak", "Grief", "Difficult truth"], reversedKeywords: ["Healing", "Forgiveness", "Release"], uprightMeaning: "A painful truth, separation, or disappointment is asking to be acknowledged. Grief can feel sharp, but facing it honestly is the beginning of healing rather than a reason to blame yourself.", reversedMeaning: "You may be beginning to recover from an old hurt, or still carrying pain that needs attention. Forgiveness can free you without excusing what happened.", description: "Heartache brings a hard truth into focus and asks for tenderness during recovery.", advice: "Give the hurt a safe place to be heard, and seek support instead of minimizing it." },
  { id: 53, name: "Four of Swords", number: "Four", iconName: "Shield", uprightKeywords: ["Rest", "Recovery", "Reflection"], reversedKeywords: ["Burnout", "Stagnation", "Restlessness"], uprightMeaning: "Your mind and body need a deliberate interval of rest after sustained pressure. Stepping back can restore perspective and help you return with a more considered response.", reversedMeaning: "You may be pushing through exhaustion or remaining withdrawn after rest has stopped helping. Recovery needs both quiet and a gentle, realistic return to activity.", description: "A quiet interval protects your ability to think clearly and recover from recent strain.", advice: "Block out a short period of uninterrupted rest before taking on another demand." },
  { id: 54, name: "Five of Swords", number: "Five", iconName: "Shield", uprightKeywords: ["Conflict", "Tension", "Costly victory"], reversedKeywords: ["Reconciliation", "Accountability", "Moving on"], uprightMeaning: "A conflict may be producing a winner but damaging trust. Consider whether proving your point is worth the cost, and be alert to unfair tactics from any side.", reversedMeaning: "There is an opening to end a dispute, accept responsibility, or leave a harmful contest behind. Reconciliation is possible only when the real issue is addressed.", description: "A dispute exposes the cost of victory when respect and trust are sacrificed to prevail.", advice: "Choose one repair you can make, or step away from a contest that cannot be constructive." },
  { id: 55, name: "Six of Swords", number: "Six", iconName: "Shield", uprightKeywords: ["Transition", "Relief", "Moving forward"], reversedKeywords: ["Resistance", "Unfinished business", "Recurring trouble"], uprightMeaning: "You are moving away from a difficult period toward calmer conditions. The transition may be gradual and may still carry sadness, but distance and support can make recovery possible.", reversedMeaning: "An unresolved issue may be following you, or fear is keeping you tied to a painful situation. Change requires acknowledging what you cannot take with you.", description: "A passage out of turmoil offers measured relief, even when the journey is not yet complete.", advice: "Identify one practical change that would make the next week calmer and begin there." },
  { id: 56, name: "Seven of Swords", number: "Seven", iconName: "Shield", uprightKeywords: ["Strategy", "Independence", "Discretion"], reversedKeywords: ["Exposure", "Avoidance", "Self-deception"], uprightMeaning: "Careful planning and discretion may be useful, especially when you need to act independently. Make sure strategy does not become dishonesty or an attempt to avoid necessary accountability.", reversedMeaning: "A hidden matter may be coming to light, or you are confronting a truth you have avoided. Evasion is becoming harder than an honest correction.", description: "A quiet strategy can protect your interests, but integrity determines whether it will hold.", advice: "Keep sensitive plans private where needed, but be straightforward with anyone directly affected." },
  { id: 57, name: "Eight of Swords", number: "Eight", iconName: "Shield", uprightKeywords: ["Restriction", "Self-doubt", "New perspective"], reversedKeywords: ["Release", "Agency", "Clear thinking"], uprightMeaning: "Fear and self-doubt may be narrowing your sense of choice. Some limits are real, but others may loosen when you question assumptions and ask for practical help.", reversedMeaning: "You are beginning to recognize options that were hidden by anxiety, or are ready to reclaim agency. Progress comes from manageable actions rather than waiting to feel fearless.", description: "A restrictive outlook feels binding, yet a shift in perspective can reveal a way to act.", advice: "Name one assumption that makes you feel trapped and test it with a small action." },
  { id: 58, name: "Nine of Swords", number: "Nine", iconName: "Shield", uprightKeywords: ["Anxiety", "Worry", "Sleeplessness"], reversedKeywords: ["Relief", "Seeking help", "Facing fears"], uprightMeaning: "Worry may be magnifying a problem during quiet hours. Your distress is real, but fear is not proof that the worst outcome will happen; bring the concern into the open.", reversedMeaning: "You may be finding relief by naming your fears and seeking support, or anxiety remains hidden behind a composed exterior. You do not have to manage it alone.", description: "Anxious thoughts demand care and perspective rather than more solitary rumination.", advice: "Tell a trusted person what is weighing on you and choose one concern to address in daylight." },
  { id: 59, name: "Ten of Swords", number: "Ten", iconName: "Shield", uprightKeywords: ["Ending", "Exhaustion", "Acceptance"], reversedKeywords: ["Recovery", "Resisting closure", "Renewal"], uprightMeaning: "A painful chapter has reached its limit. The ending may feel stark, but it also marks the point beyond which the same struggle need not continue.", reversedMeaning: "Recovery is possible, though fear or attachment may keep reopening what is over. Let the ending be real so your energy can return to the future.", description: "A difficult conclusion makes space for recovery once you stop asking an exhausted chapter to continue.", advice: "Accept what has ended and take one restorative step before making a new commitment." },
  { id: 60, name: "Page of Swords", number: "Page", iconName: "Shield", uprightKeywords: ["Curiosity", "Observation", "Clear questions"], reversedKeywords: ["Gossip", "Hasty conclusions", "Defensiveness"], uprightMeaning: "A sharp, curious mind is ready to investigate and learn. Ask direct questions, gather evidence, and stay open to revising your view as new information appears.", reversedMeaning: "Rumors, reactive messages, or premature conclusions may be creating confusion. Curiosity is useful only when paired with care for accuracy and other people's privacy.", description: "Alert observation uncovers useful information when curiosity is guided by fairness.", advice: "Check a source before repeating a claim, and ask one clarifying question before judging." },
  { id: 61, name: "Knight of Swords", number: "Knight", iconName: "Shield", uprightKeywords: ["Decisive action", "Ambition", "Directness"], reversedKeywords: ["Haste", "Hostility", "Poorly aimed effort"], uprightMeaning: "A clear objective and strong conviction can cut through delay. Move decisively, but remember that speed is useful only when your facts are sound and your approach is fair.", reversedMeaning: "Impatience or aggression may be pushing you into conflict without a useful plan. Pause long enough to consider who will be affected by your words and actions.", description: "Swift resolve can advance an important cause, provided urgency does not outrun judgment.", advice: "Before sending or saying it, check that your message is accurate, necessary, and respectful." },
  { id: 62, name: "Queen of Swords", number: "Queen", iconName: "Shield", uprightKeywords: ["Discernment", "Independence", "Honesty"], reversedKeywords: ["Bitterness", "Harsh judgment", "Isolation"], uprightMeaning: "Clear judgment and hard-won experience help you see a situation without illusion. You can be compassionate while setting firm boundaries and speaking with precision.", reversedMeaning: "Disappointment may be hardening into cynicism or overly sharp criticism. Protecting yourself does not require shutting out every source of warmth.", description: "Independent thought and direct speech bring clarity without surrendering compassion.", advice: "State the boundary plainly, then leave room for a fair response." },
  { id: 63, name: "King of Swords", number: "King", iconName: "Shield", uprightKeywords: ["Reason", "Fair authority", "Integrity"], reversedKeywords: ["Coldness", "Abuse of authority", "Bias"], uprightMeaning: "Sound judgment, expertise, and fairness can guide an important decision. Use authority responsibly, distinguish evidence from assumption, and explain the reasoning behind your choice.", reversedMeaning: "Logic may be used to dominate rather than understand, or a decision-maker is acting with bias and excessive coldness. Authority without accountability is not wisdom.", description: "Principled judgment brings order when reason is balanced by fairness and responsibility.", advice: "Write down the evidence and standards behind your decision, then apply them consistently." },
  { id: 64, name: "Ace of Pentacles", number: "Ace", iconName: "Gem", uprightKeywords: ["Opportunity", "Material foundation", "Growth"], reversedKeywords: ["Missed chance", "Poor planning", "Instability"], uprightMeaning: "A practical opportunity can grow into lasting security. This may involve work, money, health, or a new skill; its promise depends on steady care rather than instant reward.", reversedMeaning: "A promising opening may be delayed, poorly planned, or beyond your current resources. Review the details before investing time or money.", description: "A tangible seed of prosperity appears, ready to take root through careful and consistent effort.", advice: "Check the costs and next steps, then make one grounded move to develop the opportunity." },
  { id: 65, name: "Two of Pentacles", number: "Two", iconName: "Gem", uprightKeywords: ["Adaptability", "Priorities", "Balance"], reversedKeywords: ["Disorganization", "Overload", "Imbalance"], uprightMeaning: "Several responsibilities need to be balanced, and flexibility will help you respond to changing demands. Good management means choosing priorities, not pretending every task is equally urgent.", reversedMeaning: "Too many obligations may be undermining your health or reliability. A missed detail is a signal to simplify and renegotiate commitments.", description: "Changing demands call for practical rhythm and honest decisions about what can fit.", advice: "Choose your top two priorities for today and move one lower-priority task." },
  { id: 66, name: "Three of Pentacles", number: "Three", iconName: "Gem", uprightKeywords: ["Teamwork", "Craft", "Recognition"], reversedKeywords: ["Poor collaboration", "Uneven effort", "Lack of skill"], uprightMeaning: "Good work grows through skill, feedback, and cooperation. A team or mentor can help turn individual effort into something stronger and more durable.", reversedMeaning: "Collaboration may be faltering because roles are unclear, effort is uneven, or quality is being overlooked. Address the process instead of silently carrying the whole project.", description: "Shared craftsmanship produces stronger results when each person's contribution is respected.", advice: "Clarify who owns the next task and ask for specific feedback on your work." },
  { id: 67, name: "Four of Pentacles", number: "Four", iconName: "Gem", uprightKeywords: ["Security", "Saving", "Boundaries"], reversedKeywords: ["Possessiveness", "Fear of loss", "Overgiving"], uprightMeaning: "Protecting resources and creating stability are important now. Healthy security gives you a foundation; it becomes limiting only when fear prevents every reasonable risk or act of generosity.", reversedMeaning: "You may be holding too tightly to money, control, or familiar routines, or releasing resources without enough care. Find a balance between protection and flow.", description: "The wish for stability is understandable, but security should support life rather than confine it.", advice: "Review one budget or boundary and decide what is prudent to protect and what can be shared." },
  { id: 68, name: "Five of Pentacles", number: "Five", iconName: "Gem", uprightKeywords: ["Hardship", "Scarcity", "Support"], reversedKeywords: ["Recovery", "Accepting help", "Renewed security"], uprightMeaning: "Financial strain, illness, or exclusion may leave you feeling alone. The hardship deserves practical attention, but support may be closer than you think if you allow yourself to ask.", reversedMeaning: "A difficult period can begin to ease through help, new resources, or renewed confidence. Recovery may be gradual, and accepting support is part of it.", description: "A period of material or emotional strain calls for practical aid and connection, not silent endurance.", advice: "Contact one person or service that could offer concrete help with the immediate problem." },
  { id: 69, name: "Six of Pentacles", number: "Six", iconName: "Gem", uprightKeywords: ["Generosity", "Fair exchange", "Support"], reversedKeywords: ["Strings attached", "Inequality", "Dependency"], uprightMeaning: "Resources, time, or expertise can be shared in a fair and constructive exchange. Giving and receiving are both honorable when expectations are transparent and help preserves dignity.", reversedMeaning: "An offer may carry hidden conditions, or one person has too much control over the exchange. Reconsider arrangements that create dependency or deny fair compensation.", description: "A balanced exchange of support strengthens trust when generosity is not used as leverage.", advice: "Make the terms clear before accepting help or offering a commitment." },
  { id: 70, name: "Seven of Pentacles", number: "Seven", iconName: "Gem", uprightKeywords: ["Patience", "Assessment", "Long-term growth"], reversedKeywords: ["Impatience", "Wasted effort", "Poor return"], uprightMeaning: "Your steady work is developing, though results may take time. Review what is growing and whether your effort is invested in the outcomes you actually value.", reversedMeaning: "Impatience or discouragement may tempt you to abandon a worthwhile effort, while continuing a poor investment is also possible. Assess evidence rather than sunk cost.", description: "A pause to assess growth helps distinguish patient investment from effort that no longer serves.", advice: "Set a realistic review date and define what progress would justify continuing." },
  { id: 71, name: "Eight of Pentacles", number: "Eight", iconName: "Gem", uprightKeywords: ["Practice", "Mastery", "Dedication"], reversedKeywords: ["Carelessness", "Perfectionism", "Stagnation"], uprightMeaning: "Focused practice is building real skill. Progress comes from attention to detail and willingness to learn, even when the work is repetitive or recognition is still modest.", reversedMeaning: "You may be rushing and producing careless work, or polishing endlessly to avoid finishing. Repetition without purpose can become stagnation rather than mastery.", description: "Consistent craftsmanship turns effort into competence one careful repetition at a time.", advice: "Choose one skill to practice deliberately and define what finished work looks like." },
  { id: 72, name: "Nine of Pentacles", number: "Nine", iconName: "Gem", uprightKeywords: ["Self-sufficiency", "Comfort", "Earned confidence"], reversedKeywords: ["Overdependence", "Appearance", "Financial strain"], uprightMeaning: "Your discipline is creating independence, comfort, or well-earned confidence. Enjoy the results of your effort while staying connected to the values that made them meaningful.", reversedMeaning: "A polished appearance may conceal financial strain, or dependence is limiting your choices. Rebuild security around sustainable habits rather than comparison.", description: "A measure of independence reflects patient work and the ability to enjoy what you have cultivated.", advice: "Take stock of one resource you built yourself and make a plan to maintain it." },
  { id: 73, name: "Ten of Pentacles", number: "Ten", iconName: "Gem", uprightKeywords: ["Legacy", "Long-term security", "Community"], reversedKeywords: ["Family conflict", "Instability", "Misaligned values"], uprightMeaning: "Long-term security is strengthened by family, community, and resources built across generations. Consider what kind of legacy your everyday choices are creating, beyond wealth alone.", reversedMeaning: "Family conflict, uncertain finances, or competing values may unsettle a shared foundation. Traditions deserve respect, but they should not excuse unfairness or silence.", description: "Enduring security comes from shared values and care for what will outlast the present moment.", advice: "Discuss one practical long-term plan openly with the people it affects." },
  { id: 74, name: "Page of Pentacles", number: "Page", iconName: "Gem", uprightKeywords: ["Study", "Practical beginnings", "Opportunity"], reversedKeywords: ["Procrastination", "Poor follow-through", "Distraction"], uprightMeaning: "A useful chance to study, earn, or build something tangible is taking shape. Curiosity paired with consistent effort can turn a small beginning into a dependable skill or resource.", reversedMeaning: "A goal may be stalled by procrastination, distraction, or unrealistic expectations about quick results. Reconnect with the practical reason you chose it.", description: "A grounded beginner studies a real opportunity and prepares to nurture it into lasting progress.", advice: "Set a modest learning or savings target and schedule the first focused session." },
  { id: 75, name: "Knight of Pentacles", number: "Knight", iconName: "Gem", uprightKeywords: ["Reliability", "Patience", "Steady work"], reversedKeywords: ["Stagnation", "Workaholism", "Rigidity"], uprightMeaning: "Reliable effort and patience are more valuable than dramatic shortcuts. A careful routine can deliver lasting results when you remain committed without losing sight of rest and flexibility.", reversedMeaning: "Routine may have become rigid or stagnant, or work is consuming every other part of life. Examine whether your persistence is still leading somewhere worthwhile.", description: "Steady responsibility builds trust and progress when diligence is balanced with adaptability.", advice: "Keep the useful routine, but schedule a review and a genuine period of rest." },
  { id: 76, name: "Queen of Pentacles", number: "Queen", iconName: "Gem", uprightKeywords: ["Practical care", "Resourcefulness", "Grounded support"], reversedKeywords: ["Overgiving", "Neglect", "Material worry"], uprightMeaning: "Practical care creates a secure and welcoming environment. You can support others through resourcefulness and attention while also treating your own time, health, and finances as worthy of care.", reversedMeaning: "You may be overextending yourself, neglecting basic needs, or using material control to soothe worry. Care becomes sustainable when it includes you.", description: "Warm, capable stewardship turns everyday resources into comfort and dependable support.", advice: "Handle one practical need for yourself before taking on another person's task." },
  { id: 77, name: "King of Pentacles", number: "King", iconName: "Gem", uprightKeywords: ["Prosperity", "Stewardship", "Responsible leadership"], reversedKeywords: ["Greed", "Control", "Material insecurity"], uprightMeaning: "Experience and sound stewardship can create durable prosperity. Lead responsibly, honor your commitments, and measure success by the stability and well-being your resources make possible.", reversedMeaning: "Fear of losing status or wealth may lead to greed, excessive control, or risky displays of security. Material success is hollow if it depends on exploiting others.", description: "Mature stewardship sustains prosperity by combining practical judgment with responsibility to others.", advice: "Review a financial or leadership choice for long-term fairness, not just immediate gain." }
];

export const TAROT_DECK: TarotCard[] = [...MAJOR_ARCANA, ...MINOR_ARCANA].map((card) => ({ ...card, ...TAROT_INTERPRETATIONS[card.id] }));

export const ZODIAC_SIGNS: ZodiacSign[] = [
  {
    id: "aries",
    name: "Aries",
    symbol: "♈",
    dateRange: "Mar 21 – Apr 19",
    element: "Fire",
    rulingPlanet: "Mars",
    traits: ["Courageous", "Determined", "Confident", "Enthusiastic"],
    compatibility: "Leo, Sagittarius",
    luckyColor: "Crimson Red",
    horoscope: {
      general: "The celestial currents are igniting your passion today. A cosmic alignment with Mars gives you an extra burst of willpower, perfect for initiating bold projects that you've been delaying.",
      love: "Open communication will break an unspoken barrier today. Be direct but gentle with your heart's desires.",
      career: "A leadership position is opening up. Stand tall and let your unique problem-solving capabilities shine.",
      luckyNumber: 9,
      luckyTime: "10:30 AM",
      mood: "Unstoppable"
    }
  },
  {
    id: "taurus",
    name: "Taurus",
    symbol: "♉",
    dateRange: "Apr 20 – May 20",
    element: "Earth",
    rulingPlanet: "Venus",
    traits: ["Reliable", "Patient", "Practical", "Devoted"],
    compatibility: "Virgo, Capricorn",
    luckyColor: "Emerald Green",
    horoscope: {
      general: "Venus is shining a nurturing light on your domestic sector today. Focus on grounding yourself in nature, organizing your space, and celebrating the physical comforts that bring you peace.",
      love: "Sensual pleasures and stable, comforting presence are favored. Plan a quiet, luxurious night with your favorite meals.",
      career: "A slow, deliberate financial decision made today will yield incredible compounding benefits down the line.",
      luckyNumber: 6,
      luckyTime: "2:15 PM",
      mood: "Grounded"
    }
  },
  {
    id: "gemini",
    name: "Gemini",
    symbol: "♊",
    dateRange: "May 21 – Jun 20",
    element: "Air",
    rulingPlanet: "Mercury",
    traits: ["Adaptable", "Outgoing", "Intellectual", "Inquisitive"],
    compatibility: "Libra, Aquarius",
    luckyColor: "Saffron Yellow",
    horoscope: {
      general: "Your intellectual curiosity is running at an all-time high today. Conversations flow seamlessly, making it an incredible time to network, pitch ideas, or dive into deep esoteric research.",
      love: "Laughter and deep mental connection are your love language today. Share a quirky theory with someone special.",
      career: "Multitasking comes naturally today, but focus on completing one major project before starting three new ones.",
      luckyNumber: 5,
      luckyTime: "4:40 PM",
      mood: "Sparkling"
    }
  },
  {
    id: "cancer",
    name: "Cancer",
    symbol: "♋",
    dateRange: "Jun 21 – Jul 22",
    element: "Water",
    rulingPlanet: "Moon",
    traits: ["Intuitive", "Protective", "Sentimental", "Empathetic"],
    compatibility: "Scorpio, Pisces",
    luckyColor: "Silver Pearl",
    horoscope: {
      general: "The Moon is highly active in your sign, heightening your empathy and psychic receptivity. You can feel the underlying emotional layers of any room. Use this gift to heal yourself and others.",
      love: "Vulnerability is your superpower today. Share a memory or a soft secret with a partner to deepen the bond.",
      career: "Trust your gut instincts over spreadsheets today when negotiating or evaluating a prospective partner.",
      luckyNumber: 2,
      luckyTime: "9:15 PM",
      mood: "Intuitively Deep"
    }
  },
  {
    id: "leo",
    name: "Leo",
    symbol: "♌",
    dateRange: "Jul 23 – Aug 22",
    element: "Fire",
    rulingPlanet: "Sun",
    traits: ["Generous", "Warmhearted", "Charismatic", "Loyal"],
    compatibility: "Aries, Sagittarius",
    luckyColor: "Warm Gold",
    horoscope: {
      general: "Your ruling celestial body, the Sun, is radiating directly into your aura. People are naturally drawn to your warmth and charisma. Use this beautiful spotlight to inspire, create, and lead.",
      love: "Grand romantic gestures or expressing bold appreciation will create a lasting, joyful memory today.",
      career: "Your creative portfolio is under review. Highlight your unique signature stamp; do not try to blend in.",
      luckyNumber: 1,
      luckyTime: "12:00 PM",
      mood: "Radiant"
    }
  },
  {
    id: "virgo",
    name: "Virgo",
    symbol: "♍",
    dateRange: "Aug 23 – Sep 22",
    element: "Earth",
    rulingPlanet: "Mercury",
    traits: ["Analytical", "Hardworking", "Kind", "Practical"],
    compatibility: "Taurus, Capricorn",
    luckyColor: "Deep Navy Blue",
    horoscope: {
      general: "A beautiful alignment in your sector of order invites you to declutter your mind and environment. You can see the exact steps required to solve a complex puzzle that has frustrated others.",
      love: "Acts of service and practical help are your best expressions of care today. Help a loved one organize a burden.",
      career: "Your precision and attention to detail are spotted by superiors. A subtle promotion or recognition is imminent.",
      luckyNumber: 3,
      luckyTime: "8:00 AM",
      mood: "Razor Sharp"
    }
  },
  {
    id: "libra",
    name: "Libra",
    symbol: "♎",
    dateRange: "Sep 23 – Oct 22",
    element: "Air",
    rulingPlanet: "Venus",
    traits: ["Harmonious", "Diplomatic", "Artistic", "Gracious"],
    compatibility: "Gemini, Aquarius",
    luckyColor: "Soft Turquoise",
    horoscope: {
      general: "Cosmic balances are shifting in your favor today. You are a natural mediator, and your ability to bring harmony to chaotic spaces is highly requested. Surround yourself with art and beautiful music.",
      love: "A beautiful day for equal partnership. Balance the scales of give-and-take to restore absolute peace.",
      career: "Negotiations or signing cooperative contracts are highly favored. Everyone leaves satisfied with your mediation.",
      luckyNumber: 7,
      luckyTime: "5:30 PM",
      mood: "Harmonious"
    }
  },
  {
    id: "scorpio",
    name: "Scorpio",
    symbol: "♏",
    dateRange: "Oct 23 – Nov 21",
    element: "Water",
    rulingPlanet: "Pluto",
    traits: ["Passionate", "Resourceful", "Brave", "Mysterious"],
    compatibility: "Cancer, Pisces",
    luckyColor: "Midnight Obsidian",
    horoscope: {
      general: "Pluto is stirring deep transformations inside you. It is a day of profound psychological breakthrough. Let go of old control patterns to allow new spiritual power to emerge.",
      love: "Intense, soulful connections are highlighted. Superficial talk won't work; you need deep, unfiltered intimacy.",
      career: "An investigation or deep research project yields a critical hidden variable. Trust what is written between the lines.",
      luckyNumber: 8,
      luckyTime: "11:11 PM",
      mood: "Transformative"
    }
  },
  {
    id: "sagittarius",
    name: "Sagittarius",
    symbol: "♐",
    dateRange: "Nov 22 – Dec 21",
    element: "Fire",
    rulingPlanet: "Jupiter",
    traits: ["Generous", "Idealistic", "Philosophical", "Humorous"],
    compatibility: "Aries, Leo",
    luckyColor: "Royal Amethyst",
    horoscope: {
      general: "Jupiter, the planet of expansion, is expanding your boundaries today. Your mind is focused on the horizon—new travels, philosophical ideas, and spiritual systems are beckoning you forward.",
      love: "Adventure awaits! Try something brand new with a partner, or travel to an unexplored area to spark excitement.",
      career: "A bold, calculated risk pays off. Your optimism is a powerful magnet for lucky financial breaks today.",
      luckyNumber: 4,
      luckyTime: "3:15 PM",
      mood: "Adventurous"
    }
  },
  {
    id: "capricorn",
    name: "Capricorn",
    symbol: "♑",
    dateRange: "Dec 22 – Jan 19",
    element: "Earth",
    rulingPlanet: "Saturn",
    traits: ["Responsible", "Disciplined", "Patient", "Ambitious"],
    compatibility: "Taurus, Virgo",
    luckyColor: "Charcoal Bronze",
    horoscope: {
      general: "Saturn is strengthening your discipline and determination. You are building lasting foundations, and the steady, tireless effort you put in today will secure your status for years to come.",
      love: "Showing reliability and long-term commitment matters most. A solid promise counts more than fancy words.",
      career: "A long-term project is reaching a major milestone. Keep your head down and finish strong; the reward is secure.",
      luckyNumber: 10,
      luckyTime: "9:00 AM",
      mood: "Relentless"
    }
  },
  {
    id: "aquarius",
    name: "Aquarius",
    symbol: "♒",
    dateRange: "Jan 20 – Feb 18",
    element: "Air",
    rulingPlanet: "Uranus",
    traits: ["Progressive", "Original", "Independent", "Humanitarian"],
    compatibility: "Gemini, Libra",
    luckyColor: "Electric Turquoise",
    horoscope: {
      general: "Uranus is sparking flash-of-insight visions in your mind. You are thinking outside the collective box, channeling futuristic solutions for humanitarian issues or complex community problems.",
      love: "Embrace your eccentricities and unique style. The right person will love your quirky spiritual views.",
      career: "Collaborative teamwork and digital brainstorming are highly favored. Your modern perspective leads the way.",
      luckyNumber: 11,
      luckyTime: "6:15 PM",
      mood: "Inspired"
    }
  },
  {
    id: "pisces",
    name: "Pisces",
    symbol: "♓",
    dateRange: "Feb 19 – Mar 20",
    element: "Water",
    rulingPlanet: "Neptune",
    traits: ["Compassionate", "Artistic", "Intuitive", "Wise"],
    compatibility: "Cancer, Scorpio",
    luckyColor: "Ocean Teal",
    horoscope: {
      general: "Neptune is dissolving the barrier between your physical reality and spiritual realms. Your dreams are prophetic, your creative energy is limitless, and your compassion knows no bounds today.",
      love: "A dreamy, ethereal soulmate connection is in the air. Let yourself drift in the beautiful flow of love.",
      career: "Your artistic, visual, or healing talents are highly effective. Channel your dreams directly into your work.",
      luckyNumber: 7,
      luckyTime: "11:11 AM",
      mood: "Dreamy & Prophetic"
    }
  }
];

export const NUMEROLOGY_PROFILES: Record<number, NumerologyProfile> = {
  1: {
    number: 1,
    title: "The Pioneer Leader",
    tagline: "Independence, innovation, and starting new paths.",
    personality: "You are a natural-born leader, fiercely independent, and brimming with original ideas. You possess an unyielding drive to be the first and the best in your chosen endeavors.",
    strengths: ["Courageous", "Innovative", "Strong-willed", "Self-motivated"],
    weaknesses: ["Impatient", "Self-centered", "Aggressive", "Fear of failure"],
    careerPaths: ["Entrepreneur", "Executive", "Creative Director", "Inventor"],
    compatibility: "3, 5, 7"
  },
  2: {
    number: 2,
    title: "The Harmonic Peacekeeper",
    tagline: "Diplomacy, cooperation, and intuitive sensitivity.",
    personality: "You are the ultimate supportive partner, diplomat, and mediator. Your strength lies in intuition, empathy, and your gentle ability to bring people together in complete harmony.",
    strengths: ["Empathetic", "Diplomatic", "Patient", "Intuitive"],
    weaknesses: ["Overly sensitive", "Codependent", "Passive-aggressive", "Indecisive"],
    careerPaths: ["Mediator", "Counselor", "Artist", "Diplomat"],
    compatibility: "4, 6, 8"
  },
  3: {
    number: 3,
    title: "The Creative Communicator",
    tagline: "Self-expression, artistic genius, and joy of life.",
    personality: "You are a radiant source of joy, humor, and creative self-expression. You find meaning in art, writing, performing, or inspiring others with your sparkling conversational charisma.",
    strengths: ["Expressive", "Optimistic", "Imaginative", "Charismatic"],
    weaknesses: ["Unfocused", "Superficial", "Gossipy", "Anxious"],
    careerPaths: ["Writer", "Actor", "Marketing Expert", "Public Speaker"],
    compatibility: "1, 5, 9"
  },
  4: {
    number: 4,
    title: "The Master Builder",
    tagline: "Stability, structure, hard work, and loyalty.",
    personality: "You are the rock of society. Practical, disciplined, and incredibly reliable, you specialize in taking chaotic ideas and building stable, structured systems that last for generations.",
    strengths: ["Organized", "Loyal", "Practical", "Extremely disciplined"],
    weaknesses: ["Rigid", "Stubborn", "Overly cautious", "Workaholic"],
    careerPaths: ["Architect", "Financial Planner", "Project Manager", "Engineer"],
    compatibility: "2, 6, 8"
  },
  5: {
    number: 5,
    title: "The Free Spirit Adventurer",
    tagline: "Freedom, adaptability, travel, and sensory curiosity.",
    personality: "You crave absolute freedom, variety, and adventure. You are a versatile explorer who learns through direct sensory experience, constant change, and meeting diverse cultures.",
    strengths: ["Adaptable", "Adventurous", "Charismatic", "Curious"],
    weaknesses: ["Restless", "Impulsive", "Inconsistent", "Indulgent"],
    careerPaths: ["Travel Writer", "Sales Director", "Event Planner", "Public Relations"],
    compatibility: "1, 3, 7"
  },
  6: {
    number: 6,
    title: "The Divine Nurturer",
    tagline: "Responsibility, healing, unconditional love, and service.",
    personality: "You carry a powerful vibration of love, home, and community service. You are the ultimate caregiver, healer, and protector, finding purpose in bringing comfort to suffering souls.",
    strengths: ["Compassionate", "Responsible", "Protective", "Natural healer"],
    weaknesses: ["Intrusive", "Self-sacrificing", "Perfectionist", "Guilt-ridden"],
    careerPaths: ["Doctor/Nurse", "Teacher", "Social Worker", "Interior Designer"],
    compatibility: "2, 4, 9"
  },
  7: {
    number: 7,
    title: "The Sacred Seeker",
    tagline: "Analysis, spirituality, wisdom, and solitude.",
    personality: "You are a spiritual detective and truth-seeker. You live inside your mind and spirit, possessing an exceptional intellect combined with a natural gift for deep esoteric mysteries.",
    strengths: ["Analytical", "Philosophical", "Intuitive", "Independent"],
    weaknesses: ["Secretive", "Cold", "Skeptical", "Socially isolated"],
    careerPaths: ["Researcher", "Astronomer", "Spiritual Mentor", "Analyst"],
    compatibility: "1, 5, 9"
  },
  8: {
    number: 8,
    title: "The Manifestation Powerhouse",
    tagline: "Abundance, business power, authority, and karma.",
    personality: "You are a force of worldly achievement, material abundance, and administrative mastery. You understand how the laws of cause-and-effect govern physical and financial success.",
    strengths: ["Ambitious", "Efficient", "Strong leader", "Abundant manifestation"],
    weaknesses: ["Materialistic", "Overbearing", "Authoritarian", "Impulsive"],
    careerPaths: ["CEO", "Financial Advisor", "Real Estate Mogul", "Lawyer"],
    compatibility: "2, 4, 6"
  },
  9: {
    number: 9,
    title: "The Universal Humanitarian",
    tagline: "Compassion, global vision, completion, and healing.",
    personality: "You are a soulful, wise humanitarian who loves all of humanity. You have reached a stage of spiritual completion, ready to offer selfless service, artistic genius, and healing to the world.",
    strengths: ["Altruistic", "Generous", "Artistic", "Globally minded"],
    weaknesses: ["Vague", "Moody", "Prone to martyr complex", "Struggles with letting go"],
    careerPaths: ["Philanthropist", "Artist/Musician", "Spiritual Teacher", "Environmentalist"],
    compatibility: "3, 6, 7"
  },
  11: {
    number: 11,
    title: "The Master Intuitive Messenger (11)",
    tagline: "Divine illumination, spiritual insight, and charisma.",
    personality: "A Master Number. You are a bridge between physical realms and spiritual planes, holding intense intuitive radar, prophetic vision, and a magnetic charisma meant to illuminate humanity.",
    strengths: ["Highly intuitive", "Idealistic", "Charismatic", "Spiritual pioneer"],
    weaknesses: ["High nervous energy", "Extremely sensitive", "Prone to anxiety", "Self-doubt"],
    careerPaths: ["Spiritual Channel", "Motivational Speaker", "Creative Visionary", "Psychic"],
    compatibility: "2, 7, 9"
  },
  22: {
    number: 22,
    title: "The Master Builder Architect (22)",
    tagline: "Turning huge cosmic dreams into physical reality.",
    personality: "A Master Number. You possess the spiritual vision of the 11 combined with the practical discipline of the 4, enabling you to manifest grand humanitarian dreams on a global scale.",
    strengths: ["Practical visionary", "Natural organizer", "Extremely capable", "Ambitious"],
    weaknesses: ["Rigorous self-pressure", "Fear of failure", "Control issues", "Overworked"],
    careerPaths: ["Global Planner", "Real Estate Developer", "Philosophical Architect", "Founder"],
    compatibility: "4, 8, 11"
  }
};

export const CHAT_TEMPLATES = [
  { sender: "AuraSeeker", text: "Is there a specific card indicating a career shift soon?", role: "viewer" },
  { sender: "Seraphina_Mystic", text: "Wow, the energy in this room is incredible! ✨", role: "viewer" },
  { sender: "Luna_Phase", text: "Can you consult cards for my love life? Scorpio here!", role: "viewer" },
  { sender: "SolarEclipse", text: "Just sent a Cosmic Lotus! Thank you for the guidance 🌸", role: "viewer" },
  { sender: "ZenTraveler", text: "My Life Path is 7, matches the Hermit perfectly!", role: "viewer" },
  { sender: "CosmicSage", text: "Do reversed cards always mean negative energy or just slow growth?", role: "viewer" },
  { sender: "EarthStar", text: "I feel so grounded listening to this reading.", role: "viewer" },
  { sender: "CrystalLover", text: "Just got my daily Tarot. The Star upright! So happy 🌟", role: "viewer" },
  { sender: "NebulaQueen", text: "Beautiful gold deck you have there!", role: "viewer" }
];

export const GIFT_TEMPLATES = [
  { id: "quartz", name: "Crystal Quartz", cost: 5, icon: "💎", color: "from-blue-400 to-purple-400" },
  { id: "lotus", name: "Golden Lotus", cost: 20, icon: "🪷", color: "from-amber-300 to-yellow-500" },
  { id: "chalice", name: "Cosmic Chalice", cost: 50, icon: "🏆", color: "from-cyan-400 to-teal-400" },
  { id: "feather", name: "Phoenix Feather", cost: 100, icon: "🪶", color: "from-red-500 to-amber-500" },
  { id: "star", name: "Cosmic Star Sphere", cost: 200, icon: "✨", color: "from-purple-500 to-pink-500" }
];
