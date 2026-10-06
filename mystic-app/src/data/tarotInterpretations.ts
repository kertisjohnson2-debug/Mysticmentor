// Expanded readings for the existing Tarot deck, keyed by existing card id. Merged into TAROT_DECK in spiritualData.ts.
export type TarotInterpretation = { uprightMeaning: string; reversedMeaning: string; advice: string };

export const TAROT_INTERPRETATIONS: Record<number, TarotInterpretation> = {
  0: {
    uprightMeaning: "The Fool stands at the cliff's edge with the sun behind him, a small bundle on his shoulder and a white rose in his hand. White speaks of open-hearted innocence, and the little dog at his heels is instinct and loyalty walking beside him. This card marks a clean beginning: a path, project, or season that asks for trust more than certainty. You do not need the whole map. Curiosity, play, and a willingness to be a beginner are the doorway, and the universe often meets the first honest step with unexpected support.",
    reversedMeaning: "Reversed, the Fool's leap loses its grounding. Enthusiasm may slide into carelessness, or the cliff may feel so high that you refuse to move at all. Look for places where you are ignoring practical details, repeating a hasty pattern, or letting fear disguise itself as caution. The card does not ask you to abandon your dream; it asks you to pack the essentials, check the terrain, and choose a first step you can stand behind.",
    advice: "Begin before you feel fully ready, but bring one sensible safeguard with you. Let wonder lead and wisdom walk beside it."
  },
  1: {
    uprightMeaning: "The Magician raises one hand to the heavens and points the other to the earth, with the four suit symbols laid out on his table. He is the bridge between idea and form, showing that you already hold the tools you need: attention, skill, voice, and intention. This card appears when focus can turn potential into something real. Clear purpose, confident communication, and resourcefulness are strong now. What you give your concentrated energy to will take shape, so choose it with care and act with integrity.",
    reversedMeaning: "Reversed, the Magician suggests talent that is scattered, doubted, or used without full honesty. You may be juggling too many aims, hiding your gifts, or presenting a polished surface that does not match what you feel. It can also warn against persuasion that serves ego over truth. Return to one clear intention, check your motives, and gather the tools you have been overlooking before you try to cast anything new.",
    advice: "Name one intention and give it your full attention today. Use your gifts openly and honestly rather than for show."
  },
  2: {
    uprightMeaning: "The High Priestess sits between the pillars of light and shadow, a veil of pomegranates behind her and the moon at her feet. She guards the threshold of the inner world, where knowledge arrives through stillness, dreams, and quiet knowing rather than argument. This card invites you to listen before you act. Something is not yet ready to be spoken, and not everything needs to be explained. Trust the subtle signals you keep noticing; your intuition is gathering information that logic alone cannot reach.",
    reversedMeaning: "Reversed, the Priestess may point to intuition that is drowned out by noise, secrets that keep their power through avoidance, or a habit of ignoring your own inner voice to please others. You might be seeking answers everywhere except within. Take quiet time without screens or advice, write down what you sense, and notice where you have been pretending not to know something you already feel.",
    advice: "Make room for silence today. Write down what you sense before asking anyone else what you should think."
  },
  3: {
    uprightMeaning: "The Empress rests in a lush garden of ripe wheat and flowing water, crowned with stars and surrounded by abundance. She is the nurturing, creative force of nature: beauty, comfort, fertility of ideas, and the pleasure of tending what you love. This card encourages you to receive as well as give. Slow down, engage your senses, and let growth happen at its natural pace. Care for relationships, creative work, your home, and your body shows that nourishment is itself a form of wisdom.",
    reversedMeaning: "Reversed, the Empress can reveal depletion: giving until nothing is left, neglecting your own comfort, or feeling blocked in creativity. It may also point to smothering care or dependence on others for reassurance. The garden still wants to grow, but it needs rest, water, and boundaries. Look at where you have been overextended and where a little gentle self-care would restore your creative flow.",
    advice: "Do one nourishing thing for your body, your space, or your creativity today. Care is productive work."
  },
  4: {
    uprightMeaning: "The Emperor sits on a stone throne carved with rams' heads, armored beneath his robes, with barren mountains behind him. He stands for structure, stability, and the steady authority that creates safety for others. This card asks you to bring order to the situation: set clear boundaries, make a plan, and take responsibility for what is yours to lead. Strength here is calm rather than loud. When you build firm foundations and keep your word, people and projects can rest on you.",
    reversedMeaning: "Reversed, authority may become rigid, controlling, or absent. You might be clinging to rules that no longer serve, resisting guidance, or avoiding the responsibility of leadership. It can also describe a figure whose power depends on pressure rather than trust. Ask where more flexibility would help, or where firmer structure would calm the chaos. Balanced leadership is both steady and listening.",
    advice: "Create one clear boundary or plan this week and keep to it. Lead with steadiness, not force."
  },
  5: {
    uprightMeaning: "The Hierophant sits between two pillars, raising a hand in blessing before two kneeling followers, with crossed keys at his feet. He represents tradition, shared teaching, and the wisdom passed down through communities and mentors. This card suggests that guidance may come from established practices, trusted teachers, or a group that shares your values. There is comfort in belonging and learning within a tradition. Consider what you have inherited, what still holds meaning, and who is ready to walk the path alongside you.",
    reversedMeaning: "Reversed, the Hierophant questions rules and expectations that no longer fit. You may be outgrowing a belief system, resisting conformity, or ready to find your own way of practicing what matters to you. It can also warn against blind obedience or empty ritual. Honor what is genuinely meaningful, release what is hollow, and let your personal truth grow from what you have tested yourself.",
    advice: "Seek a teacher, book, or community that deepens your path. Keep what is meaningful and question the rest."
  },
  6: {
    uprightMeaning: "The Lovers stand beneath an angel's blessing, one beside the tree of knowledge and one beside the tree of flame. Beyond romance, this card is about alignment: choosing what is true to your heart and values, and being honest in connection. A meaningful bond or decision is highlighted, one that asks for authenticity and mutual respect. When you choose from your deepest values rather than from pressure or fear, harmony follows, and the choice becomes a commitment you can stand behind.",
    reversedMeaning: "Reversed, the Lovers point to imbalance, mixed signals, or a choice made against your own values. Communication may be strained, or you may be avoiding a decision because every option has a cost. It can also invite a look at your relationship with yourself. Clarify what you truly want, speak honestly, and consider whether your actions match what you say you value.",
    advice: "Make your next choice from your values rather than your fear. Speak honestly and listen just as openly."
  },
  7: {
    uprightMeaning: "The Chariot is drawn by two sphinxes, one dark and one light, and the charioteer steers them by will alone beneath a canopy of stars. Victory here comes from direction and self-mastery: holding opposing forces in balance and moving toward a clear goal. This card brings determination, momentum, and focused ambition. Obstacles can be overcome when you stay disciplined and keep your attention on where you are heading. Confidence is strongest when it is paired with composure.",
    reversedMeaning: "Reversed, the Chariot suggests a loss of direction, scattered energy, or a push to win that overlooks your own limits. The sphinxes may be pulling in different directions, leaving you feeling stuck or out of control. Pause to clarify the goal, notice where you are forcing progress, and recover steady footing. Control returns when you realign your priorities, not when you drive harder.",
    advice: "Choose one destination and steer toward it calmly. Discipline works best when it is steady rather than forced."
  },
  8: {
    uprightMeaning: "Strength shows a woman gently closing the jaws of a lion while an infinity symbol floats above her head. True power here is quiet courage: patience, compassion, and the ability to meet fear or anger without cruelty. This card invites you to tame your impulses with understanding rather than force. Inner resilience is available, and gentleness may accomplish what pressure cannot. You are stronger than the challenge you face, especially when you treat yourself and others with steady kindness.",
    reversedMeaning: "Reversed, Strength can reveal self-doubt, exhaustion, or emotions that feel too big to manage. You may be suppressing the lion or letting it run unchecked. Neither is sustainable. Rebuild confidence in small steps, speak kindly to yourself, and ask for support when your reserves are low. Courage is not the absence of fear; it is choosing a gentle, steady response despite it.",
    advice: "Meet a difficult feeling with patience instead of force. Courage can be soft and still be strong."
  },
  9: {
    uprightMeaning: "The Hermit stands on a snowy peak holding a lantern that contains a six-pointed star, lighting only the next few steps. He represents deliberate solitude, reflection, and the search for inner truth. This card suggests a time to step back from the noise and ask what you truly value. Wisdom grows in quiet. You may be guided to study, meditate, or seek a mentor, and the answers you find in stillness will light the way ahead.",
    reversedMeaning: "Reversed, the Hermit can mean withdrawal that has turned into isolation, or an unwillingness to look inward at all. You may be avoiding solitude because it is uncomfortable, or hiding from others without gaining clarity. Consider whether you need more quiet or more connection. A trusted conversation may be the lantern that helps you see your next step.",
    advice: "Take a small pocket of quiet time to ask what matters most. Then let one trusted person walk beside you."
  },
  10: {
    uprightMeaning: "The Wheel of Fortune turns in the sky, ringed with ancient symbols and watched by four winged guardians. It reminds us that life moves in cycles, and that change, luck, and timing are part of the pattern. This card often signals a turning point, an unexpected opening, or the natural rise after a quieter season. You cannot control the wheel, but you can choose how you meet each position on it. Stay flexible, welcome what is shifting, and trust that movement brings new possibilities.",
    reversedMeaning: "Reversed, the Wheel may point to a feeling of bad timing, resistance to change, or a pattern that keeps repeating. It can feel as though progress has stalled or luck has run out. Often the cycle is asking you to learn something before it turns. Notice what repeats, release what you cannot control, and adjust your own approach rather than waiting for the world to change first.",
    advice: "Accept what is shifting and adapt with grace. Focus on what you can influence and let the rest turn."
  },
  11: {
    uprightMeaning: "Justice sits between two pillars holding a sword upright in one hand and balanced scales in the other. This card is about fairness, truth, and the natural consequences of our choices. It invites honest reflection: what have you set in motion, and does it reflect your values? Clear thinking, accountability, and honest dealing are favored now. Decisions made with integrity bring balance, and the truth, even when uncomfortable, ultimately brings clarity and peace.",
    reversedMeaning: "Reversed, Justice can indicate imbalance, avoidance of responsibility, or a situation that feels unfair. You may be minimizing your part in a problem, or judging yourself or others too harshly. Gather the facts calmly and be willing to see the whole picture. Fairness begins with honesty, including honesty about your own actions and what you can reasonably change.",
    advice: "Look at the facts without excuses or harsh judgment. Choose the action you could explain with a clear conscience."
  },
  12: {
    uprightMeaning: "The Hanged Man hangs calmly from a living tree by one foot, a golden halo around his head and a serene expression on his face. He has chosen to pause and view the world from a new angle. This card suggests that surrender, patience, and a change of perspective will serve you better than pushing forward. Something may be waiting to be understood before it can move. By letting go of the need to force an outcome, you open yourself to insight that active effort could never find.",
    reversedMeaning: "Reversed, the Hanged Man may point to stalling without purpose, resisting a necessary pause, or sacrificing too much without return. You might feel stuck, yet refuse to change your viewpoint. Ask whether the waiting is wise or simply habit. Choose one new perspective to try, or decide what you are no longer willing to give up, and let that clarity set you in motion.",
    advice: "Pause and look at the situation from the opposite side. Let a new perspective arrive before you act."
  },
  13: {
    uprightMeaning: "Death rides a white horse beneath a rising sun, carrying a black banner marked with a white rose, while figures of every rank bow before him. This card is rarely literal. It speaks of transformation: an ending that clears space for something new. A chapter, habit, or role is naturally complete. Grief and relief may arrive together. By honoring what is finished and releasing it with gratitude, you allow growth to begin, and the sunrise on the horizon shows that renewal follows.",
    reversedMeaning: "Reversed, Death reveals resistance to an ending that is already underway. You may be clinging to something familiar out of fear, prolonging a transition, or feeling stuck between what was and what will be. Change tends to be gentler when it is accepted. Ask what you are holding onto and what it costs you, then take one small step toward letting it go.",
    advice: "Honor what is ending and thank it for what it gave you. Then make room for what wants to begin."
  },
  14: {
    uprightMeaning: "Temperance shows an angel pouring water between two cups, one foot on land and one in a stream, beneath a glowing crown of light. She embodies moderation, patience, and harmony created by blending opposites with care. This card suggests a time to find your middle path: balance work with rest, thought with feeling, and ambition with calm. Gradual, steady effort brings healing and a deeper sense of purpose. Progress now comes through gentle adjustment rather than sudden extremes.",
    reversedMeaning: "Reversed, Temperance can point to imbalance, overindulgence, or impatience with a slow process. Life may feel out of rhythm, with too much of one thing and too little of another. Take stock of where you are overextended and where you are neglecting yourself. Small, consistent corrections, rather than dramatic fixes, will bring your energy back into harmony.",
    advice: "Find the middle path in one area of your life today. Small, steady adjustments restore balance."
  },
  15: {
    uprightMeaning: "The Devil looms over two figures loosely chained to a block, though the chains around their necks are loose enough to lift off. This card speaks of attachments, habits, and fears that feel binding but are often chosen. It may reveal unhealthy patterns, compulsions, or beliefs that limit your freedom. The invitation is honesty rather than shame: name what has a hold on you. Once seen clearly, the chain loosens, and you can begin choosing differently.",
    reversedMeaning: "Reversed, the Devil suggests a loosening of old chains. You may be breaking a habit, regaining independence, or finally acknowledging what has held you back. The process can be uncomfortable, and old patterns may tempt you to return. Be patient with yourself, seek support where needed, and keep choosing the freedom you have begun to claim.",
    advice: "Name one habit or fear that has a hold on you. Choose one small act of freedom and gather support."
  },
  16: {
    uprightMeaning: "The Tower is struck by lightning, its crown torn away as figures fall from the flames against a dark sky. This card marks sudden change that shatters structures built on shaky ground. It can feel shocking, yet it frees you from illusions and false security. What falls was no longer sustainable, and truth is revealed in the aftermath. Though the experience may be unsettling, it clears the way for more honest, stable foundations to be built.",
    reversedMeaning: "Reversed, the Tower can suggest a crisis narrowly avoided, a slower unraveling, or a fear of necessary change. You may be holding together something that is already cracking. Resisting the shift can prolong the strain. Consider which foundations need strengthening or releasing now, so change can come on your terms rather than as a surprise.",
    advice: "Let go of what is already crumbling. Begin rebuilding on honest, steady foundations."
  },
  17: {
    uprightMeaning: "The Star kneels beside a quiet pool, pouring water onto the land and into the stream while a great star shines above her. After upheaval, this card brings hope, healing, and renewed faith. It invites you to rest, breathe, and trust that guidance is near. Gentle inspiration and a sense of calm return. Your needs are being met in subtle ways, and being open, authentic, and kind to yourself allows light to find its way back into your days.",
    reversedMeaning: "Reversed, the Star may point to discouragement, doubt, or a sense of disconnection from hope. You might feel drained and unsure that things will improve. The light has not gone out, but it may be hidden by fatigue. Rest, nourish yourself, and look for small signs of comfort. Hope often returns through gentle routines and reaching out to someone supportive.",
    advice: "Rest, breathe, and tend to your spirit. Notice one small sign of hope and let it encourage you."
  },
  18: {
    uprightMeaning: "The Moon glows above a winding path between two towers, with a dog, a wolf, and a crayfish emerging from the water. This card enters the realm of dreams, intuition, and uncertainty, where things are not as clear as they seem. Emotions may be strong and shadows may play tricks on perception. Move gently and trust your inner senses while avoiding hasty conclusions. Clarity will come with time, and honoring your feelings without being ruled by fear will guide you through.",
    reversedMeaning: "Reversed, the Moon suggests that confusion is beginning to lift, or that fears and illusions are being faced. Hidden information may come to light. It can also point to anxiety that is hard to shake or a tendency to avoid uncomfortable feelings. Ground yourself in simple facts and routines, speak about what worries you, and let clarity arrive at its own pace.",
    advice: "Move slowly while things are unclear. Ground yourself in facts and trust your steady, calm instincts."
  },
  19: {
    uprightMeaning: "The Sun shines over a joyful child riding a white horse before a wall of sunflowers. This is one of the brightest cards, speaking of vitality, success, and the simple happiness of being seen and welcomed. Warmth, confidence, and openness are strong now, and clarity replaces confusion. Celebrate your progress and share your joy generously. This card encourages authenticity and play, a reminder that you are allowed to enjoy the good that is here.",
    reversedMeaning: "Reversed, the Sun hints at joy that feels dimmed or delayed, or optimism that has become overconfidence. A cloud may be passing over something that is still fundamentally good. Look for what is draining your enthusiasm and what small pleasures could restore it. The light is still present, and a little patience and honest self-care will help it return.",
    advice: "Let yourself enjoy what is going well. Share your warmth and do one thing purely for the joy of it."
  },
  20: {
    uprightMeaning: "Judgement shows an angel sounding a trumpet as figures rise from their graves with open arms. This card is a call to awaken: to review your path with honesty, forgive the past, and answer a deeper calling. It marks a time of reckoning that is also a release. You are invited to see your experiences as part of a larger story and to step into a renewed purpose. By meeting yourself with compassion, you can rise and begin again.",
    reversedMeaning: "Reversed, Judgement can reveal self-criticism, hesitation to answer a calling, or difficulty forgiving yourself or another. You may be replaying old mistakes instead of learning from them. Offer yourself the same compassion you would give a friend. Reflect on the lesson, release the harsh verdict, and let yourself respond to the call that keeps returning.",
    advice: "Review the past with kindness, not harshness. Respond to the calling that keeps returning to you."
  },
  21: {
    uprightMeaning: "The World shows a dancer within a laurel wreath, holding two wands and surrounded by the four creatures of the elements. This card signals completion, wholeness, and the fulfillment of a long journey. Lessons have been integrated and a cycle is closing with a sense of achievement. Take time to appreciate how far you have come. Even as you celebrate, a new horizon is opening, and your growth has prepared you to step into it with confidence and gratitude.",
    reversedMeaning: "Reversed, the World suggests something is nearly complete but not yet finished, or that a final step is being delayed. You may be reluctant to close a chapter or unsure how to move on. Identify the loose ends and complete them gently. Celebrating what you have achieved will help you let go and move forward with a full heart.",
    advice: "Finish what is nearly complete and acknowledge your progress. Celebrate before you begin the next chapter."
  },
  // Wands: creative fire, ambition, and action
  22: {
    uprightMeaning: "A hand emerges from a cloud offering a living branch, the first spark of the suit of fire. The Ace of Wands brings a surge of inspiration, courage, and creative possibility. An idea, project, or desire is ready to become real, and your enthusiasm is the fuel. You do not need every answer yet. What matters is the willingness to begin, and to trust the energy that rises when something genuinely excites you.",
    reversedMeaning: "The spark is flickering: an idea may be delayed, scattered across too many beginnings, or dimmed by self-doubt. Enthusiasm needs direction to become progress. Rather than waiting for perfect inspiration, choose one promising idea and give it a small, steady start. A tiny action can rekindle a fire that waiting cannot.",
    advice: "Choose the idea that excites you most and take one concrete step today. Let momentum build from there."
  },
  23: {
    uprightMeaning: "A figure holds a globe and gazes over the sea from a castle wall, a wand in each hand. The Two of Wands marks the moment after a first success, when you ask what comes next. You have a foothold, and a larger horizon is calling. This card encourages thoughtful planning and bold vision, weighing your options while remembering that a wider world is within reach if you are willing to step beyond what is comfortable.",
    reversedMeaning: "Fear of the unknown or incomplete planning may be keeping your ambitions small. You might be waiting for a guarantee that no meaningful venture can give, or staying in a comfortable but limiting position. Gently ask what you are afraid will happen if you try. Naming the fear often reveals the first practical step toward a larger life.",
    advice: "Write down the bigger goal you have been quietly considering. Then decide on one practical move toward it."
  },
  24: {
    uprightMeaning: "A traveler stands on a cliff watching ships sail across the water, three wands planted firmly beside him. The Three of Wands shows early efforts beginning to bear fruit as opportunities arrive from further afield. Your foresight and planning have laid a path, and now expansion becomes possible. Stay patient while your plans travel, keep your vision wide, and be ready to welcome news, partnerships, or progress that comes from beyond your immediate circle.",
    reversedMeaning: "Ships may be delayed, plans may meet obstacles, or expectations may be running ahead of reality. It can feel as though progress is slow or support is missing. Review whether your plan is realistic and flexible enough, and whether some part of it needs another approach. Delay is not defeat; it is information about what to adjust.",
    advice: "Keep your long view while handling the next practical task. Adjust the plan rather than abandoning the vision."
  },
  25: {
    uprightMeaning: "Four wands support a garland canopy while figures celebrate in front of a gracious castle. The Four of Wands is a card of joyful milestones, stability, and community. A project, home, or relationship has reached a point worth celebrating, and you are invited to enjoy it with others. This is a time for gratitude, gatherings, and recognizing what you have built together, a reminder that happiness grows when it is shared.",
    reversedMeaning: "The celebration may feel muted, or the sense of home and belonging may be unsettled. Tension in a community, delay in a milestone, or an unspoken disagreement could be shadowing your sense of security. Gently address what feels off instead of avoiding it. A little honesty can restore the warmth that makes a place feel like home.",
    advice: "Celebrate a recent achievement with people you care about. Name one thing that helps you feel at home."
  },
  26: {
    uprightMeaning: "Five figures brandish wands in a tangle that looks more like a scuffle than a battle. The Five of Wands describes friction, competition, and clashing opinions, often from people who all want to be heard. While it can feel chaotic, the conflict also tests and sharpens your ideas. Stay curious and keep a sense of humor. Productive rivalry can lead to better results when everyone remembers they are working on something larger than winning.",
    reversedMeaning: "Conflict may be avoided, simmering beneath the surface, or finally easing. You might be suppressing disagreement to keep the peace, or stuck in a pointless power struggle. Seek honest conversation and clear ground rules. Resolving the tension, rather than pretending it is absent, frees energy that can go into what you actually want to create.",
    advice: "Share your view clearly and listen to the others. Seek a shared goal that makes the clash productive."
  },
  27: {
    uprightMeaning: "A rider wearing a laurel wreath rides a decorated horse through a cheering crowd, a wand crowned in victory. The Six of Wands celebrates public recognition, progress, and well-earned confidence. Your effort is being seen, and success invites you to hold your head high while staying gracious. Allow yourself to enjoy the moment and thank those who supported you. Confidence earned through real work is a quiet strength you can carry into the next challenge.",
    reversedMeaning: "Recognition may be delayed, or your confidence may be shaken by comparison or fear of failure. You might also be relying too much on outside approval. Remind yourself of what you have genuinely accomplished and decide what success means to you. Self-respect rooted in your own progress is steadier than applause.",
    advice: "Acknowledge one thing you have achieved and thank someone who helped. Let your own progress count."
  },
  28: {
    uprightMeaning: "A figure stands on higher ground, defending his position with a wand against six others rising from below. The Seven of Wands asks for courage to stand up for your beliefs and boundaries. You have an advantage that is worth protecting, yet the challenge may feel relentless. Stay grounded in your reasons, hold your position calmly, and remember that determination, not aggression, is the strength that keeps your footing.",
    reversedMeaning: "You may be exhausted from defending yourself, or tempted to give up your position under pressure. Alternatively, you might be defensive when no real attack is present. Ask which battles truly matter and where you can lower your guard. Protecting your energy is wise, and not every challenge needs a response.",
    advice: "Decide what is worth defending and let the rest go. Stand firm calmly instead of fighting everyone."
  },
  29: {
    uprightMeaning: "Eight wands fly through a clear sky toward the ground, bright and unobstructed. The Eight of Wands brings swift movement, news, and rapid progress after a period of waiting. Things that have been stalled may suddenly accelerate, so stay alert and responsive. This is a time for quick, clear communication and decisive follow-through. Ride the momentum while it lasts, but keep your aim steady so that speed carries you where you actually want to go.",
    reversedMeaning: "Delays, miscommunication, or scattered energy may slow your progress. Alternatively, things might be moving so fast that you feel out of control. Pause to clarify your direction and check the details. Slowing down briefly can prevent mistakes and help you regain the rhythm that makes movement productive.",
    advice: "Respond promptly to what is moving now and double-check the details. Keep your aim clear as things speed up."
  },
  30: {
    uprightMeaning: "A bandaged figure leans on a wand, eyes alert, with eight more wands standing behind him like a fence. The Nine of Wands is the resilience of someone who has been through a great deal and is still standing. You are close to the finish, though weary and wary. Draw on the strength you have already proven, and remember that boundaries and rest are part of endurance. One last effort, taken with care, can carry you through.",
    reversedMeaning: "Exhaustion or old wounds may be making you overly guarded, or you may feel unable to continue. Stubbornness might keep you from accepting help. Consider whether your defenses are protecting you or isolating you. Resting, asking for support, and trusting that not every challenge is a threat can restore your strength.",
    advice: "Rest where you can and lean on someone you trust. You have more endurance than you think."
  },
  31: {
    uprightMeaning: "A figure bends under the weight of ten wands, walking toward a distant village. The Ten of Wands shows the burden of taking on too much, often out of loyalty, ambition, or habit. The load is nearly delivered, yet it is heavy. This card asks you to examine what you are carrying and whether all of it is yours. Delegating, prioritizing, and setting some things down will make the final stretch lighter and more sustainable.",
    reversedMeaning: "You may be at the point of releasing a heavy burden, or still refusing to let go of responsibilities that are overwhelming you. Burnout can build quietly. Take an honest inventory of your commitments and choose what to set down, share, or postpone. Lightening your load is not failure; it is how you keep going.",
    advice: "List what you are carrying and put one item down or share it. Let go of what is not truly yours."
  },
  32: {
    uprightMeaning: "A young figure studies a sprouting wand in a desert landscape, curious and ready to explore. The Page of Wands brings fresh inspiration, a message, or a new interest that awakens your sense of adventure. You do not need to be an expert; enthusiasm and a willingness to learn are enough. Follow what sparks your curiosity and let discovery guide you toward what is worth pursuing more deeply.",
    reversedMeaning: "Excitement may be fading before an idea has had a fair chance, or enthusiasm may be running ahead of preparation. You might feel unsure where to begin, or be drawn in too many directions. Choose a modest, low-risk way to explore and see what holds your interest. Small experiments reveal what deserves your commitment.",
    advice: "Try something new in a small, playful way. Let curiosity lead before you ask it to commit."
  },
  33: {
    uprightMeaning: "A knight in decorated armor gallops across the desert, his horse reared and eager. The Knight of Wands brings bold action, passion, and an appetite for adventure. Confidence and energy are strong, and this can be a time for travel, change, or a project pursued with full heart. Channel your drive with purpose and be mindful of how your pace affects others, so your adventure builds something rather than just burning bright.",
    reversedMeaning: "Restlessness may turn to haste, inconsistency, or promises made in the heat of the moment. Enthusiasm could burn out before you finish what you start. Slow your pace enough to plan, and be honest about what you can follow through on. Directed energy accomplishes far more than scattered intensity.",
    advice: "Pursue what excites you, but decide how you will finish it. Pair your passion with a plan."
  },
  34: {
    uprightMeaning: "A queen sits confidently on her throne with a sunflower in hand and a black cat at her feet. The Queen of Wands radiates warmth, charisma, and creative confidence. She inspires others by simply being authentically herself, and she follows through on what she cares about. This card encourages you to claim your presence, express your passion openly, and lead with generosity, welcoming people into the energy you create.",
    reversedMeaning: "Confidence may waver, or charm may be used to dominate or seek attention. You might feel overlooked, jealous, or drained from giving too much of yourself. Reconnect with what truly makes you feel alive and let that, rather than approval, set your pace. Warmth is strongest when it is genuine and balanced with rest.",
    advice: "Express your passion without apology and welcome others in. Protect the energy that keeps your fire alive."
  },
  35: {
    uprightMeaning: "A king sits on a throne decorated with salamanders, holding a flowering wand and looking ahead with calm authority. The King of Wands is the visionary leader who turns ideas into reality and inspires others to follow. Bold, confident, and purposeful, he leads by example. This card encourages you to set a clear vision, take responsibility for it, and empower the people around you so the vision belongs to everyone involved.",
    reversedMeaning: "Leadership may become domineering, impatient, or inconsistent, or a grand vision may lack follow-through. You might be tempted to control rather than inspire. Check whether your ambition is serving others as well as yourself. Listening, delegating, and grounding big dreams in practical steps restores respect and effectiveness.",
    advice: "Share your vision clearly and invite others into it. Lead by example and keep your promises."
  },
  // Cups: emotion, relationships, and intuition
  36: {
    uprightMeaning: "A hand rises from a cloud holding a cup that overflows with five streams, while a dove descends above it. The Ace of Cups is the beginning of the heart's suit: a flow of love, compassion, and emotional renewal. A new connection, creative inspiration, or a deeper kindness toward yourself is available. Open your heart gently and allow yourself to receive as freely as you give, trusting what feels sincere.",
    reversedMeaning: "Feelings may be held back, or you may be emotionally depleted after giving so much. You might be guarding your heart against disappointment or ignoring your own needs. Reconnection begins with honest acknowledgment of what you feel. Tend to yourself with the care you readily offer others, and let the cup fill slowly.",
    advice: "Make space for one honest conversation or one act of care toward yourself. Let the feeling flow."
  },
  37: {
    uprightMeaning: "Two figures exchange cups beneath a winged lion's head and a caduceus, a symbol of healing and union. The Two of Cups celebrates mutual respect, attraction, and connection between equals. A loving partnership, a deep friendship, or a productive alliance may be forming through honest exchange. Genuine closeness grows when both people give and receive openly, creating trust that feels balanced and alive.",
    reversedMeaning: "A relationship may feel uneven, strained by unspoken expectations or misunderstandings. One person may be giving more than the other, or communication may have stalled. Restoring connection requires both people to name their needs and listen fairly. Honest dialogue, rather than assumption, brings the relationship back into balance.",
    advice: "Say what you need and ask what the other person needs. Mutual honesty is the basis of connection."
  },
  38: {
    uprightMeaning: "Three women raise their cups in a joyful dance among ripe fruit and flowers. The Three of Cups celebrates friendship, community, and shared joy. A gathering, reunion, or supportive circle brings laughter and renewal. This card encourages you to savor the company of people who uplift you and to celebrate victories together. Connection is a source of strength, and joy multiplies when it is shared.",
    reversedMeaning: "Social life may feel draining, cliquish, or overly indulgent, or a friendship may be strained by gossip or exclusion. You might be isolating yourself or overextending to keep up appearances. Consider which relationships truly nourish you and make room for those. Quality companionship matters more than constant company.",
    advice: "Reach out to a friend who lifts your spirits. Celebrate something with the people who share your joy."
  },
  39: {
    uprightMeaning: "A figure sits under a tree with arms crossed, three cups before him, while a hand from a cloud offers a fourth. The Four of Cups describes contemplation, apathy, or a feeling that nothing quite satisfies. You may be so absorbed in what is missing that you overlook a gentle offer nearby. Take time for quiet reflection, and stay open to subtle opportunities. A fresh perspective may reveal gifts that were already present.",
    reversedMeaning: "A period of withdrawal may be ending, and you are beginning to notice new options or renewed motivation. Alternatively, you might still be stuck in boredom or dissatisfaction. Gently ask what you are truly longing for. Taking one small step toward engagement, even when it feels flat, can bring your interest back to life.",
    advice: "Notice what is being offered to you right now. Take a small step out of your routine."
  },
  40: {
    uprightMeaning: "A cloaked figure mourns three spilled cups while two upright cups stand behind, and a bridge leads to a distant home. The Five of Cups speaks of grief, regret, and loss. It is natural to dwell on what went wrong, and your feelings deserve acknowledgment. Yet something remains, and healing begins when you turn to see it. Allow sadness its time while remembering that you are not left with nothing.",
    reversedMeaning: "You may be starting to recover from disappointment, accept what happened, and look toward what remains. Alternatively, you may be stuck in regret or avoiding grief altogether. Gentle acceptance and self-forgiveness allow you to move forward. Grief honored fully tends to soften with time and support.",
    advice: "Let yourself feel the loss without judgment. Then look at what still remains and take one gentle step toward it."
  },
  41: {
    uprightMeaning: "Two children exchange a flower-filled cup in a cobbled courtyard, a scene of innocence and gentle nostalgia. The Six of Cups brings memories, kindness, and simple joys from the past. A reunion, an act of generosity, or a return to something comforting may be near. Revisiting what once brought happiness can offer healing and perspective, as long as it helps you appreciate the present rather than replace it.",
    reversedMeaning: "You may be stuck in nostalgia, idealizing the past, or struggling to let go of old hurts. Alternatively, it may be time to outgrow patterns from childhood. Honor what was good and release what no longer serves you. Letting the past teach you, rather than define you, makes space for a richer present.",
    advice: "Reconnect with a happy memory or old friend. Let it warm you without pulling you away from today."
  },
  42: {
    uprightMeaning: "A figure gazes at seven cups floating in clouds, each holding a different vision: jewels, a castle, a dragon, and more. The Seven of Cups is the dazzling array of possibilities, dreams, and fantasies. Choices are plentiful, but not all are real. This card asks you to separate wishful thinking from what you can truly pursue. Enjoy your imagination, then ground your favorite vision with practical steps.",
    reversedMeaning: "A fog of confusion may be lifting, bringing clarity about what you truly want. Alternatively, you may feel overwhelmed by options or caught in daydreams without action. Narrow your choices and test one in a practical way. Clarity grows from small commitments, not endless contemplation.",
    advice: "Write down your options and choose the one worth testing. Turn one dream into a small, real step."
  },
  43: {
    uprightMeaning: "A figure in a red cloak walks away from eight neatly stacked cups toward distant mountains under a moon. The Eight of Cups is the courageous decision to leave something that no longer fulfills you, even though it looks complete from the outside. A deeper search is calling. Walking away can be sorrowful, yet it honors your truth. Trust that seeking meaning, rather than comfort, is a worthy journey.",
    reversedMeaning: "You may be hesitating to leave a situation that has stopped nourishing you, or running away without understanding what you need. Fear of the unknown can keep you in place, while restlessness can push you to flee. Reflect on what is missing and what you truly seek, and let that guide your next move.",
    advice: "Ask what you are really searching for. Leave only what no longer serves your growth, and do so with care."
  },
  44: {
    uprightMeaning: "A contented figure sits with arms crossed before a curved table holding nine cups, a satisfied smile on his face. The Nine of Cups is the wish card, a sign of emotional fulfillment, gratitude, and enjoyment of what you have earned. Pleasure and comfort are well deserved. Savor your achievements, but also share your good fortune generously, because contentment grows when it is rooted in thankfulness rather than display.",
    reversedMeaning: "Satisfaction may feel hollow, or you might be chasing pleasure to avoid deeper needs. Perhaps a wish has not yet come true, or you are overindulging. Ask what would truly fulfill you beyond surface comforts. Genuine contentment comes from alignment with your values, not just from having more.",
    advice: "Take a moment to feel grateful for what is already good. Share your happiness with someone else."
  },
  45: {
    uprightMeaning: "A family stands beneath a rainbow of ten cups, their arms raised in joy, with a happy home in the distance. The Ten of Cups is emotional fulfillment, harmony, and deep belonging. Love and shared values create a stable, joyful life. This card encourages you to appreciate your closest bonds and cultivate the home, community, or chosen family that makes you feel truly supported.",
    reversedMeaning: "Harmony at home or in a close relationship may feel disrupted, or the ideal you hoped for may not match reality. Misaligned values or unspoken tensions could be at play. Honest conversation and realistic expectations rebuild trust. True togetherness is built from patience and care, not perfection.",
    advice: "Express appreciation to someone you love. Build belonging through small acts of presence."
  },
  46: {
    uprightMeaning: "A young figure by the sea holds a cup from which a fish peers out, a playful sign of the unexpected. The Page of Cups brings a tender message, creative inspiration, or the beginning of an emotional connection. Intuition is awake, and your imagination may offer gentle guidance. Stay open to sweet surprises and trust the quiet nudges that invite you to feel and create.",
    reversedMeaning: "Emotional immaturity, moodiness, or blocked creativity may be present. You might be ignoring your intuition, or taking disappointments too personally. Treat your feelings with curiosity rather than judgment, and nurture your creative side in small, safe ways. Sensitivity becomes strength when it is understood.",
    advice: "Follow a creative or intuitive nudge today. Let your feelings speak without letting them rule."
  },
  47: {
    uprightMeaning: "A knight rides slowly, holding a cup carefully before him as if offering a gift. The Knight of Cups is the romantic, idealistic messenger who brings an invitation, proposal, or heartfelt offer. Charm, imagination, and sincerity are present. This card encourages you to follow your heart's ideals while staying grounded, and to express your feelings clearly and kindly.",
    reversedMeaning: "Moodiness, unrealistic expectations, or promises that do not match actions may appear. You might be avoiding responsibility by retreating into fantasy. Compare words with deeds, and decide whether feelings are leading to genuine commitment. Romance becomes lasting when it is supported by honesty and follow-through.",
    advice: "Express what you feel with sincerity and back it up with action. Stay romantic and realistic."
  },
  48: {
    uprightMeaning: "A queen sits on a seaside throne gazing into an ornate closed cup, a calm tide at her feet. The Queen of Cups is compassionate, intuitive, and emotionally wise. She listens deeply and offers comfort without losing her own center. This card invites you to trust your empathy, care for others from a full cup, and honor your feelings as a source of understanding.",
    reversedMeaning: "Emotional overwhelm, codependency, or moodiness may arise. You may be absorbing others' feelings or neglecting your own. Boundaries are an act of care, not coldness. Spend time in quiet reflection and restore your own balance so your compassion can remain steady and genuine.",
    advice: "Care for others from a full cup. Set a gentle boundary that protects your emotional energy."
  },
  49: {
    uprightMeaning: "A king sits on a throne amid rolling waves, holding a cup and scepter with calm composure. The King of Cups blends emotional depth with wise restraint. He listens, supports, and guides without being swept away. This card encourages you to balance heart and mind, respond rather than react, and offer steady, compassionate leadership that others find reassuring.",
    reversedMeaning: "Emotions may be suppressed, manipulated, or erupting unpredictably. You might be avoiding vulnerability or using control to cover insecurity. Honest self-reflection brings balance. Allow yourself to feel and express what is real, and look for healthy outlets that keep your composure genuine rather than forced.",
    advice: "Pause before responding to a strong feeling. Offer calm, compassionate support without hiding your own heart."
  },
  // Swords: mind, truth, and communication
  50: {
    uprightMeaning: "A hand rises from a cloud grasping an upright sword crowned with a laurel wreath, the first breakthrough of the suit of air. The Ace of Swords brings sudden clarity, a truth finally named, or an idea sharp enough to cut through confusion. You may see a situation plainly for the first time. This clarity is a gift that asks for courage and fairness: speak honestly, think clearly, and let the truth guide your next decision.",
    reversedMeaning: "Thinking may be clouded, communication blunt, or a truth is being avoided because it feels too sharp. You might be overwhelmed by information or using words as weapons. Slow down, gather the facts, and choose language that is clear without being cruel. Clarity returns when you give your mind both focus and kindness.",
    advice: "Name the plain truth of the situation, gently and clearly. Then decide on one honest next step."
  },
  51: {
    uprightMeaning: "A blindfolded figure sits holding two crossed swords before a calm, moonlit sea. The Two of Swords is the pause of a difficult choice, a stalemate in which you protect yourself by not looking. Balance is possible, yet staying here too long only delays the decision. Remove the blindfold when you are ready: gather what you know, listen to your inner voice, and trust that a clear choice is better than endless hesitation.",
    reversedMeaning: "The truth you have postponed is surfacing, or the pressure of deciding has become overwhelming. Information may be coming to light that changes how you see your options. Reduce the noise, ask for honest input, and face the decision one fact at a time. Relief often follows once you stop avoiding it.",
    advice: "Write down what you know, what you are avoiding, and when you will decide. Choose a date and keep it."
  },
  52: {
    uprightMeaning: "A heart is pierced by three swords beneath a stormy sky and falling rain. The Three of Swords acknowledges heartbreak, grief, and painful truths. It can mark a separation, disappointment, or hurtful words. The pain is real and deserves compassion rather than denial. Allowing yourself to feel it honestly is the first stage of healing, and the storm, however heavy, will pass.",
    reversedMeaning: "Healing is beginning, or you are still holding on to an old hurt that needs attention. You may be starting to forgive, or replaying the pain to keep it close. Forgiveness frees you without excusing what happened. Be patient with yourself, and seek support if sorrow feels heavy.",
    advice: "Let yourself grieve without rushing. Reach out to someone gentle who will simply listen."
  },
  53: {
    uprightMeaning: "A knight lies in stone repose inside a church, three swords on the wall above and one beneath him. The Four of Swords is rest, recovery, and retreat. After strain or conflict, your mind and body need stillness. This is not laziness but preparation. By stepping back, restoring your energy, and reflecting quietly, you gather the clarity and strength to return to the world renewed.",
    reversedMeaning: "Restlessness, burnout, or an inability to rest may be present. You might be pushing through exhaustion or returning to activity before you have recovered. Consider what true rest would look like and allow it without guilt. Recovery is part of progress, not an interruption of it.",
    advice: "Schedule real rest without screens or tasks. Recovery is productive."
  },
  54: {
    uprightMeaning: "A smirking figure gathers swords while two others walk away in defeat across a stormy sky. The Five of Swords is the hollow victory: winning an argument at the cost of goodwill. Conflict, pride, or competition may be leaving everyone feeling worse. Ask what you truly want from this situation and whether winning serves it. Sometimes the wisest move is to walk away.",
    reversedMeaning: "Conflict may be easing, or lingering resentment keeps the dispute alive. You might be ready to apologize, make peace, or let go of a grudge. Alternatively, you could be avoiding necessary honesty. Choose reconciliation or boundaries based on what protects your integrity and your peace.",
    advice: "Consider whether being right is worth the cost. Choose the response that protects your peace and your integrity."
  },
  55: {
    uprightMeaning: "A ferryman poles a boat carrying a cloaked passenger and a few swords across calm water toward a distant shore. The Six of Swords is a journey away from trouble toward gentler ground. A transition is underway, perhaps an emotional healing, a move, or a change of perspective. You carry some sorrow with you, but the water is calming. Trust the passage and the steady progress it brings.",
    reversedMeaning: "You may be resisting a necessary transition, or feel stuck between where you were and where you hope to be. Unresolved baggage may weigh the boat down. Take time to sort what you are carrying and release what you do not need. Moving on is easier when you travel lighter.",
    advice: "Accept that a transition is underway. Let go of one worry you no longer need to carry."
  },
  56: {
    uprightMeaning: "A figure tiptoes away from a camp carrying five swords, glancing back at two left behind. The Seven of Swords is strategy, stealth, and sometimes evasion. You may be finding a clever way around an obstacle, or someone may not be fully honest. Ask whether your approach is wise and whether it matches your values. Cleverness serves you best when it is paired with honesty.",
    reversedMeaning: "A secret, deception, or avoided truth may be coming to light, or you may be ready to come clean. Guilt can ease when you take responsibility. Choose transparency over shortcuts, and make amends where needed. Honesty may be uncomfortable, but it brings relief and stronger trust.",
    advice: "Check whether your plan is honest as well as clever. Choose the straightforward path where you can."
  },
  57: {
    uprightMeaning: "A blindfolded, loosely bound figure stands among eight swords, with shallow water at her feet. The Eight of Swords is the feeling of being trapped, though the restraints are often looser than they seem. Fear and limiting beliefs create the cage. Look closely: there is a way out. By questioning the thoughts that hold you and taking one small step, you can begin to walk free.",
    reversedMeaning: "You are beginning to see that you have more freedom than you believed. The blindfold is slipping, and self-limiting stories are loosening. The next step is practical: ask for help, make a small change, and trust your growing clarity. Freedom is built one choice at a time.",
    advice: "Question the thought that makes you feel stuck. Take one small step the cage did not predict."
  },
  58: {
    uprightMeaning: "A figure sits up in bed, head in hands, nine swords hanging on the dark wall behind. The Nine of Swords is anxiety, sleepless worry, and nightmares of the mind. The fears may feel enormous at night, yet they are often larger in thought than in fact. Speak what troubles you to someone you trust, and ground yourself in what is real. Worries lose strength when they are shared and examined.",
    reversedMeaning: "Anxiety may be easing, or you are hiding worries that need to be heard. You might be ready to seek help, rest, or a calmer routine. Gentle support makes a real difference. Reach out, breathe slowly, and remind yourself that how you feel at night is not the whole picture of your life.",
    advice: "Share one worry with someone you trust. Ground yourself with rest, breath, and what is true right now."
  },
  59: {
    uprightMeaning: "A figure lies facedown with ten swords in his back, yet dawn breaks gently over a calm horizon. The Ten of Swords is a painful ending, a low point, or the exhaustion of a long struggle. It can feel dramatic, but it also means the worst has passed. Nothing more can be taken. Rest, accept what has ended, and notice the sunrise: from here the only direction is forward.",
    reversedMeaning: "You are slowly recovering from a hard time, or clinging to the pain of the past. The ending may be lingering, or you may be reluctant to accept it. Gentle acceptance lets you stand up again. Healing may be gradual, and each small step toward renewal counts.",
    advice: "Accept that this chapter has ended and rest. Look toward the dawn and take one gentle step."
  },
  60: {
    uprightMeaning: "A young figure stands with a raised sword on a windy hill, alert and curious. The Page of Swords is eager to learn, ask questions, and speak the truth. Fresh ideas and sharp observation are available, and a message or new line of thinking may arrive. Stay curious and honest, and use your words thoughtfully so that your quick mind builds understanding rather than argument.",
    reversedMeaning: "Words may be careless, gossip may circulate, or thoughts may be scattered. You might be speaking before thinking or avoiding a necessary conversation. Pause, gather facts, and choose your words with care. Curiosity serves you best when it is paired with patience and kindness.",
    advice: "Ask a real question and listen to the answer. Think before you speak or send."
  },
  61: {
    uprightMeaning: "A knight charges through a windy landscape with sword raised, his horse at full gallop. The Knight of Swords is speed, intellect, and determined action. He pursues goals with focus and speaks his mind. This card encourages decisive thinking and bold communication, as long as speed is balanced with consideration. Momentum helps most when it is directed by clear aims.",
    reversedMeaning: "Haste, bluntness, or arguments may cause trouble. You could be charging ahead without enough information, or paralyzed by overthinking. Slow down enough to check your facts and listen to others. A measured approach protects both your goals and your relationships.",
    advice: "Move with purpose, but check the facts first. Speak plainly and kindly."
  },
  62: {
    uprightMeaning: "A queen sits on a high throne with an upraised sword and one hand extended, clouds drifting behind her. The Queen of Swords is clear-minded, honest, and independent. She has known sorrow and learned from it, and she values truth delivered with grace. This card encourages you to think clearly, set firm boundaries, and speak candidly, using your experience to guide others with fairness.",
    reversedMeaning: "Coolness may harden into harshness, or past hurts may make you guarded. You might use sharp words to keep others at a distance. Allow warmth to temper your clarity. You can protect yourself and still be kind, and honesty is gentlest when it is offered with care.",
    advice: "Speak honestly and set a clear boundary with kindness. Let experience guide, not harden, you."
  },
  63: {
    uprightMeaning: "A king sits on a stern throne holding an upright sword, the sky clear and orderly around him. The King of Swords is intellect, authority, and fair judgment. He values logic, ethics, and well-considered decisions. This card encourages you to lead with clear reasoning, honest communication, and integrity, remembering that true authority is rooted in fairness and responsibility.",
    reversedMeaning: "Authority may become cold, rigid, or misused, with logic overshadowing compassion. You might be controlling through criticism or avoiding feeling altogether. Balance your analysis with empathy and check whether your standards serve others as well as yourself. Wise leadership listens as much as it decides.",
    advice: "Decide with clear facts and fair principles. Let compassion keep your judgment humane."
  },
  // Pentacles: work, body, home, and resources
  64: {
    uprightMeaning: "A hand emerges from a cloud offering a golden pentacle above a flourishing garden gate. The Ace of Pentacles is the seed of tangible opportunity: a new project, skill, home, or source of stability. It invites you to plant something real and tend it patiently. Practical effort and steady care will let this beginning grow into lasting security and satisfaction.",
    reversedMeaning: "An opportunity may be missed through hesitation, poor planning, or a lack of follow-through. You might feel unsupported or unsure how to begin. Look for small practical foundations you can lay now. Opportunities often return when you are prepared to receive them.",
    advice: "Plant one practical seed today: a plan, a savings habit, or a skill to practice. Tend it steadily."
  },
  65: {
    uprightMeaning: "A figure juggles two pentacles linked by an infinity loop while ships ride the waves behind. The Two of Pentacles is adaptability and balance among competing demands. You are managing a lot at once, and flexibility is your skill. Keep a light, steady rhythm, prioritize what matters, and remember that adjusting your approach is not the same as being unstable.",
    reversedMeaning: "Overwhelm, disorganization, or too many commitments may be pulling you off balance. You might be dropping balls or neglecting something important. Simplify, make a priority list, and let go of what is not essential. Balance returns when you choose fewer things to hold well.",
    advice: "List your current commitments and choose the top three. Release or postpone the rest."
  },
  66: {
    uprightMeaning: "A craftsman works on a cathedral arch while two figures consult plans beside him. The Three of Pentacles is skillful teamwork, recognition of craft, and the pleasure of building something together. Your abilities are valued, and collaboration strengthens the result. This card encourages you to share plans, welcome feedback, and take pride in careful, quality work.",
    reversedMeaning: "Poor communication, disagreement, or uneven effort may weaken a team project. You might feel your work is overlooked, or hesitate to accept feedback. Clarify roles and expectations, and invite honest input. Good work grows when people feel heard and share a common aim.",
    advice: "Ask for honest feedback and share your plan clearly. Take pride in careful, quality work."
  },
  67: {
    uprightMeaning: "A figure sits holding one pentacle tightly, with another on his head and two under his feet. The Four of Pentacles is security, saving, and the careful guarding of resources. Stability is valuable, yet clutching too tightly can keep you from growth and generosity. Ask whether your caution is protecting you or limiting you, and find a comfortable balance between safety and openness.",
    reversedMeaning: "Fear of loss may have become possessiveness, or you may be spending without a plan. You could be loosening your grip, learning to share, or struggling with money habits. Aim for steadiness without anxiety. Generosity and wise saving can coexist.",
    advice: "Review how you hold on to resources and time. Keep what is wise and release a little with trust."
  },
  68: {
    uprightMeaning: "Two figures trudge through a snowstorm past a glowing church window, one on crutches. The Five of Pentacles is hardship, feeling left out in the cold, or worrying about material security. Help is closer than it seems, though pride or shame may keep you from seeing it. Reach out and accept support. Hard seasons are easier to cross together.",
    reversedMeaning: "Recovery is beginning, or you may be staying isolated rather than seeking help. A difficult stretch may be easing, and resources or support are returning. Be patient with your pace and ask for what you need. There is no shame in receiving care.",
    advice: "Ask for help from one trusted source. Warmth is nearer than the storm suggests."
  },
  69: {
    uprightMeaning: "A well-dressed figure holds scales while giving coins to two kneeling people. The Six of Pentacles is generosity, fairness, and the exchange of giving and receiving. Resources flow where they are needed, and kindness returns in kind. This card invites you to give with thoughtfulness and accept help without embarrassment, keeping the flow balanced and respectful.",
    reversedMeaning: "Giving or receiving may feel unbalanced, with strings attached or expectations unspoken. You might be overgiving, or depending too much on others. Clarify what is fair and sustainable. Generosity is healthiest when it is freely given and gratefully received.",
    advice: "Give or accept help in a way that feels fair. Keep the exchange honest and respectful."
  },
  70: {
    uprightMeaning: "A farmer leans on his hoe and gazes at a bush heavy with growing pentacles. The Seven of Pentacles is patient assessment after steady effort. Growth takes time, and this is a moment to pause and review how your work is progressing. Be proud of what you have planted, adjust what needs care, and trust that consistent effort will ripen in its season.",
    reversedMeaning: "Impatience, wasted effort, or doubt about whether your work is paying off may arise. You might be tempted to abandon a project too early or to keep going without reassessing. Review your goals and decide what deserves more time. Patience is wiser when it is guided by honest evaluation.",
    advice: "Review your progress honestly and adjust one thing. Give the work time to ripen."
  },
  71: {
    uprightMeaning: "A craftsman hammers pentacles onto a tree while finished pieces sit neatly in a row. The Eight of Pentacles is dedicated practice and the pleasure of mastering a skill. Careful, repeated effort builds true expertise. This card encourages you to commit to your craft, focus on quality, and enjoy the steady satisfaction of improvement.",
    reversedMeaning: "Perfectionism, boredom, or lack of focus may slow your progress. You might be cutting corners or stuck in a routine that no longer teaches you. Reconnect with why the work matters and look for a fresh way to practice. Quality grows from attention, not anxiety.",
    advice: "Set aside focused time to practice your craft. Aim for steady improvement, not perfection."
  },
  72: {
    uprightMeaning: "A graceful figure stands in a vineyard, a falcon on her gloved hand, surrounded by ripe grapes. The Nine of Pentacles is self-sufficiency, refinement, and the comfort earned through effort. You can enjoy the fruits of your discipline and the independence you have built. Take pleasure in your accomplishments, and remember that appreciating what you have is part of true abundance.",
    reversedMeaning: "Overwork, dependence on appearances, or insecurity about your achievements may appear. You might be working hard without allowing yourself to enjoy the results. Ask what real security feels like to you and make room for rest and enjoyment. Worth is not measured by constant output.",
    advice: "Enjoy something you have earned. Appreciate your independence and let yourself rest."
  },
  73: {
    uprightMeaning: "A family gathers beneath an archway beside a well-kept estate, an elder with dogs at his side. The Ten of Pentacles is legacy, lasting stability, and the security that comes from shared values and long-term planning. It speaks of family, community, and what you build that outlasts you. Tend your roots and think about the future you want to leave for others.",
    reversedMeaning: "Family tensions, instability, or uncertainty about the future may be present. Values or expectations may be clashing, or long-term plans may need revisiting. Open conversation and realistic planning help. Lasting security rests on trust and clear agreements as much as on resources.",
    advice: "Talk openly about long-term plans with those you share them with. Build what you want to last."
  },
  74: {
    uprightMeaning: "A young figure stands in a green field holding a pentacle, studying it with care. The Page of Pentacles is a diligent student with a practical dream. A new opportunity to learn, train, or begin a grounded project is available. Take it step by step, stay curious, and trust that patient effort will turn promise into skill.",
    reversedMeaning: "Procrastination, distraction, or poor follow-through may delay progress. You might be daydreaming rather than starting, or discouraged by slow results. Break your goal into small tasks and commit to one. Steady practice outperforms big intentions.",
    advice: "Choose one small practical step toward a goal and do it today. Learn patiently."
  },
  75: {
    uprightMeaning: "A knight on a sturdy, still horse examines a pentacle in a plowed field. The Knight of Pentacles is dependable, patient, and thorough. He may be slow, but he gets things done well. This card honors steady work, responsibility, and reliability. Stay the course, keep your standards, and trust that careful persistence will reach its goal.",
    reversedMeaning: "Stagnation, workaholism, or rigidity may be present. You might be stuck in routine, afraid of change, or working too hard without joy. Allow for flexibility and rest. Steady effort is strongest when it can adapt and breathe.",
    advice: "Keep going steadily, and allow one change to your routine. Reliable does not have to mean rigid."
  },
  76: {
    uprightMeaning: "A queen sits in a blooming garden holding a pentacle, a rabbit at her side and flowers all around. The Queen of Pentacles is practical care, resourcefulness, and warm hospitality. She makes a home or community where people feel nourished and safe. This card encourages you to tend your space, your body, and the people you love, and to create comfort with wise, grounded effort.",
    reversedMeaning: "Overgiving, neglecting your own needs, or struggling with balance between work and home may appear. You might feel stretched thin or anxious about material matters. Restore your own well-being first. Nurturing others is more sustainable when you are nurtured too.",
    advice: "Tend your home or body with one caring action. Care for yourself as you care for others."
  },
  77: {
    uprightMeaning: "A king sits on a throne decorated with bulls and vines, a pentacle in his hands amid a flourishing garden. The King of Pentacles is prosperity, stewardship, and dependable leadership. He builds security through patience and generosity. This card encourages you to manage resources wisely, support others, and lead by providing stability that lets people thrive.",
    reversedMeaning: "Greed, control, or insecurity about resources may arise. You might be measuring worth by possessions or holding on too tightly to authority. Reflect on what true wealth means to you. Generosity, trust, and fairness make a leader's stability something others can rely on.",
    advice: "Use your resources with care and generosity. Build security that lets others thrive too."
  }
};

const POSITION_FRAMES: Record<string, { upright: string; reversed: string }> = {
  Guidance: {
    upright: "As your single card of guidance, {card} speaks to the heart of what is asking for your attention right now. Treat it as the theme of the moment: read it slowly, notice which words land in your body, and let that be the lens for the next few days.",
    reversed: "As your single card of guidance, reversed {card} points to the place where energy is blocked, turned inward, or asking to be handled differently. This is less a warning than an invitation to look gently at what has been avoided, and to adjust your approach."
  },
  Past: {
    upright: "In the Past position, {card} describes the foundation beneath this situation: an influence, memory, or lesson that shaped where you stand now. Honor what it gave you, and notice which of its strengths you can still carry forward.",
    reversed: "In the Past position, reversed {card} suggests something unfinished or unresolved that still echoes into the present. Naming it with kindness, without blame, can loosen its hold and free energy you have been spending to hold it in place."
  },
  Present: {
    upright: "In the Present position, {card} shows the energy surrounding you right now. This is the live current of your situation, so ask yourself where its message is already moving through your choices, and where you can lean into it more consciously.",
    reversed: "In the Present position, reversed {card} reveals where the current feels tangled, delayed, or turned inside out. It points to a tension you are living with today, and to a small honest adjustment that could ease it."
  },
  Future: {
    upright: "In the Future position, {card} shows the direction your path is leaning if you keep walking as you are. It is a possibility rather than a promise, so let it inspire what you want to nurture, and remember that your choices keep shaping the road.",
    reversed: "In the Future position, reversed {card} offers a gentle caution about a pattern that could repeat unless it is met with awareness. Nothing here is fixed; treat it as a signpost that invites you to steer with intention."
  }
};

export function tarotPositionContext(position: string, cardName: string, isReversed: boolean): string {
  const frame = POSITION_FRAMES[position] ?? POSITION_FRAMES.Guidance;
  return (isReversed ? frame.reversed : frame.upright).replace("{card}", cardName);
}
