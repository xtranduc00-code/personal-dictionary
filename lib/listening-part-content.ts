import { engnovatePartContent } from "./engnovate-listening-generated/part-content";
import { listeningPartContentCam1019 } from "./listening-part-content-cam10-19";
import { listeningPartContentPatches } from "./listening-part-content-patches";
export type ChooseTwoBlock = {
  instruction: string;
  question: string;
  options: Array<{
    letter: string;
    text: string;
  }>;
  qNums: readonly [number, number] | number[];
};
export type MatchingBlock = {
  instruction: string;
  title: string;
  events: Array<{
    letter: string;
    text: string;
  }>;
  years: Array<{
    qNum: number;
    year: number;
  }>;
};
export type MapLabelingBlock = {
  instruction: string;
  letters: readonly string[];
  labels: Array<{
    qNum: number;
    text: string;
  }>;
  imageUrl?: string;
};
export type Part2MatchingRoleBlock = {
  instruction: string;
  title?: string;
  options: Array<{
    letter: string;
    text: string;
  }>;
  items: Array<{
    qNum: number;
    text: string;
  }>;
};
export type Part2Or3NotesCompletion = {
  instruction: string;
  instructionSub: string;
  sections: Array<{
    title: string;
    content: Part1CellPart[];
  }>;
};
export type Part2TableCompletion = {
  instruction: string;
  instructionSub: string;
  title: string;
  columns: [string, string, string];
  rows: Array<{
    name: Part1CellPart[];
    costs: Part1CellPart[];
    notes: Part1CellPart[];
  }>;
};
export type Part2ContentData = {
  chooseTwoBlocks?: ChooseTwoBlock[];
  matching?: MatchingBlock;
  matchingRole?: Part2MatchingRoleBlock;
  singleChoice?: {
    instruction: string;
    questions: SingleChoiceQuestion[];
  };
  mapLabeling?: MapLabelingBlock;
  notesCompletion?: Part2Or3NotesCompletion;
  tableCompletion?: Part2TableCompletion;
};
export type SingleChoiceQuestion = {
  qNum: number;
  text: string;
  options: Array<{
    letter: string;
    text: string;
  }>;
};
export type Part3MatchingBlock = {
  instruction: string;
  /** Tiêu đề in đậm giữa hướng dẫn và danh sách A–F (vd. sách Cambridge). */
  title?: string;
  options: Array<{
    letter: string;
    text: string;
  }>;
  items: Array<{
    qNum: number;
    text: string;
  }>;
  /** Bật để hiển thị danh sách A–F không chấm đầu dòng (mặc định: có bullet). */
  optionsPlainList?: boolean;
};
export type Part3ContentData = {
  chooseTwoBlocks?: ChooseTwoBlock[];
  singleChoice?: {
    instruction: string;
    questions: SingleChoiceQuestion[];
  };
  matching?: Part3MatchingBlock;
  notesCompletion?: Part2Or3NotesCompletion;
};
export type Part1CellPart =
  | {
      text: string;
    }
  | {
      blank: number;
    };
export type Part1TableContentData = {
  instruction: string;
  instructionSub: string;
  title: string;
  columns: [string, string, string];
  rows: Array<{
    name: Part1CellPart[];
    costs: Part1CellPart[];
    notes: Part1CellPart[];
  }>;
};
export type Part1Table4ColContentData = {
  instruction: string;
  instructionSub: string;
  title: string;
  columns: [string, string, string, string];
  rows: Array<{
    name: Part1CellPart[];
    location: Part1CellPart[];
    reason: Part1CellPart[];
    other: Part1CellPart[];
  }>;
};
export type Part1NotesContentData = {
  instruction: string;
  instructionSub: string;
  sections: Array<{
    title: string;
    content: Part1CellPart[];
  }>;
};
export type Part1TablePlusNotesContentData = {
  instruction: string;
  instructionSub: string;
  table?: {
    title: string;
    columns: [string, string, string] | [string, string, string, string];
    rows: Array<
      | {
          name: Part1CellPart[];
          costs: Part1CellPart[];
          notes: Part1CellPart[];
        }
      | {
          name: Part1CellPart[];
          location: Part1CellPart[];
          reason: Part1CellPart[];
          other: Part1CellPart[];
        }
    >;
  };
  sections?: Array<{
    title: string;
    content: Part1CellPart[];
  }>;
  matching?: Part3MatchingBlock;
};
export type Part4NotesContentData = {
  instruction: string;
  instructionSub: string;
  title?: string;
  sections: Array<{
    title: string;
    content: Part1CellPart[];
  }>;
};
export type Part4ContentData = {
  singleChoice: {
    instruction: string;
    title?: string;
    questions: SingleChoiceQuestion[];
  };
  notes: Part4NotesContentData;
};
export type PartContentMap = {
  part1?:
    | Part1TableContentData
    | Part1Table4ColContentData
    | Part1NotesContentData
    | Part1TablePlusNotesContentData;
  part2?: Part2ContentData;
  part3?: Part3ContentData;
  part4?: Part4NotesContentData | Part4ContentData;
};
const cam20Test4Part1: Part1NotesContentData = {
  instruction: "Complete the notes below.",
  instructionSub: "Write ONE WORD AND/OR A NUMBER for each answer.",
  sections: [
    {
      title: "Accommodation",
      content: [
        { blank: 1 },
        { text: " Hotel on George Street\nCost of family room per night: £ " },
        { blank: 2 },
        { text: " (approx.)" },
      ],
    },
    {
      title: "Recommended Trips",
      content: [
        { text: "A " },
        { blank: 3 },
        {
          text: " tour of the city centre (starts in Carlton Square)\nA trip by ",
        },
        { blank: 4 },
        { text: " to the old fort" },
      ],
    },
    {
      title: "Science Museum",
      content: [
        { text: "Best day to visit: " },
        { blank: 5 },
        { text: "\nSee the exhibition about " },
        { blank: 6 },
        { text: " which opens soon" },
      ],
    },
    {
      title: "Food",
      content: [
        { text: "Clacton Market:\n– Good for " },
        { blank: 7 },
        { text: " food\n– Need to have lunch before " },
        { blank: 8 },
        { text: " p.m." },
      ],
    },
    {
      title: "Theatre Tickets",
      content: [
        { text: "Save up to " },
        { blank: 9 },
        { text: " % on ticket prices at bargaintickets.com" },
      ],
    },
    {
      title: "Free Activities",
      content: [
        {
          text: "Blakewell Gardens:\n– Roots Music Festival\n– Climb Telegraph Hill to see a view of the ",
        },
        { blank: 10 },
        { text: "" },
      ],
    },
  ],
};
const cam20Test4Part4: Part4NotesContentData = {
  instruction: "Complete the notes below.",
  instructionSub: "Write ONE WORD ONLY for each answer.",
  title: "Research in the Area Around the Chembe Bird Sanctuary",
  sections: [
    {
      title: "The importance of birds of prey to local communities",
      content: [
        { text: "They destroy " },
        { blank: 31 },
        {
          text: " and other rodents.\nThey help prevent farmers from being bitten by ",
        },
        { blank: 32 },
        {
          text: ".\nThey have been an important part of local culture for many years.\nThey now support the economy by encouraging ",
        },
        { blank: 33 },
        { text: " in the area." },
      ],
    },
    {
      title: "Falling numbers of birds of prey",
      content: [
        { text: "– The birds may be accidentally killed:\nBy " },
        { blank: 34 },
        {
          text: " when hunting or sleeping.\nBy electrocution from power lines, especially during times of high ",
        },
        { blank: 35 },
        { text: ".\n– Local farmers may illegally shoot them or " },
        { blank: 36 },
        { text: " them." },
      ],
    },
    {
      title: "Ways of protecting chickens from birds of prey",
      content: [
        { text: "– Clearing away vegetation (unhelpful).\n– Providing a " },
        { blank: 37 },
        {
          text: " for chickens (expensive).\n– Frightening birds of prey by:\nKeeping a ",
        },
        { blank: 38 },
        { text: ".\nMaking a " },
        { blank: 39 },
        { text: " (e.g., with metal objects).\n– A " },
        { blank: 40 },
        { text: " of methods is usually most effective." },
      ],
    },
  ],
};
const cambridge20Content: Record<string, PartContentMap> = {
  "cambridge-20|test-1": {
    part1: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD AND/OR A NUMBER for each answer.",
      title: "Restaurant Recommendations",
      columns: [
        "Name of restaurant",
        "Location",
        "Reason for recommendation",
        "Other comments",
      ],
      rows: [
        {
          name: [{ text: "The Junction" }],
          location: [{ text: "Grayson Street, near the station" }],
          reason: [
            { text: "Good for people who are especially keen on " },
            { blank: 1 },
            { text: "" },
          ],
          other: [
            { text: "Quite expensive\n\nThe " },
            { blank: 2 },
            { text: " is a good place for a drink" },
          ],
        },
        {
          name: [{ text: "Paloma" }],
          location: [{ text: "In Bow Street next to the cinema" }],
          reason: [{ blank: 3 }, { text: " food, good for sharing" }],
          other: [
            {
              text: "Staff are very friendly\nNeed to pay £50 deposit\nA limited selection of ",
            },
            { blank: 4 },
            { text: " food on the menu" },
          ],
        },
        {
          name: [{ text: "The " }, { blank: 5 }, { text: "" }],
          location: [{ text: "At the top of a " }, { blank: 6 }, { text: "" }],
          reason: [
            { text: "A famous chef\nAll the " },
            { blank: 7 },
            { text: " are very good\nOnly uses " },
            { blank: 8 },
            { text: " ingredients" },
          ],
          other: [
            { text: "Set lunch costs £ " },
            { blank: 9 },
            { text: " per person\nPortions probably of " },
            { blank: 10 },
            { text: " size" },
          ],
        },
      ],
    },
    part2: {
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C.",
        questions: [
          {
            qNum: 11,
            text: "Heather says pottery differs from other art forms because",
            options: [
              { letter: "A", text: "It lasts longer in the ground." },
              { letter: "B", text: "It is practised by more people." },
              { letter: "C", text: "It can be repaired more easily." },
            ],
          },
          {
            qNum: 12,
            text: "Archaeologists sometimes identify the use of ancient pottery from",
            options: [
              { letter: "A", text: "The clay it was made with." },
              { letter: "B", text: "The marks that are on it." },
              { letter: "C", text: "The basic shape of it." },
            ],
          },
          {
            qNum: 13,
            text: "Some people join Heather's pottery class because they want to",
            options: [
              { letter: "A", text: "Create an item that looks very old." },
              { letter: "B", text: "Find something that they are good at." },
              { letter: "C", text: "Make something that will outlive them." },
            ],
          },
          {
            qNum: 14,
            text: "What does Heather value most about being a potter?",
            options: [
              { letter: "A", text: "Its calming effect" },
              { letter: "B", text: "Its messy nature" },
              { letter: "C", text: "Its physical benefits" },
            ],
          },
          {
            qNum: 15,
            text: "Most of the visitors to Edelman Pottery",
            options: [
              { letter: "A", text: "Bring friends to join courses." },
              { letter: "B", text: "Have never made a pot before." },
              { letter: "C", text: "Try to learn techniques too quickly." },
            ],
          },
          {
            qNum: 16,
            text: "Heather reminds her visitors that they should",
            options: [
              { letter: "A", text: "Put on their aprons." },
              { letter: "B", text: "Change their clothes." },
              { letter: "C", text: "Take off their jewellery." },
            ],
          },
        ],
      },
      chooseTwoBlocks: [
        {
          instruction: "Choose TWO letters, A–E.",
          question: "Which TWO things does Heather explain about kilns?",
          options: [
            { letter: "A", text: "What their function is" },
            { letter: "B", text: "When they were invented" },
            { letter: "C", text: "Ways of keeping them safe" },
            { letter: "D", text: "Where to put one in your home" },
            { letter: "E", text: "What some people use instead of one" },
          ],
          qNums: [17, 18],
        },
        {
          instruction: "Choose TWO letters, A–E.",
          question: "Which points does Heather make about a potter's tools?",
          options: [
            { letter: "A", text: "Some are hard to hold." },
            { letter: "B", text: "Some are worth buying." },
            { letter: "C", text: "Some are essential items." },
            { letter: "D", text: "Some have memorable names." },
            {
              letter: "E",
              text: "Some are available for use by participants.",
            },
          ],
          qNums: [19, 20],
        },
      ],
    },
    part3: {
      chooseTwoBlocks: [
        {
          instruction: "Choose TWO letters, A–E.",
          question:
            "Which TWO things do the students both believe are responsible for the increase in loneliness?",
          options: [
            { letter: "A", text: "Social media" },
            { letter: "B", text: "Smaller nuclear families" },
            { letter: "C", text: "Urban design" },
            { letter: "D", text: "Longer lifespans" },
            { letter: "E", text: "A mobile workforce" },
          ],
          qNums: [21, 22],
        },
        {
          instruction: "Choose TWO letters, A–E.",
          question:
            "Which TWO health risks associated with loneliness do the students agree are based on solid evidence?",
          options: [
            { letter: "A", text: "A weakened immune system" },
            { letter: "B", text: "Dementia" },
            { letter: "C", text: "Cancer" },
            { letter: "D", text: "Obesity" },
            { letter: "E", text: "Cardiovascular disease" },
          ],
          qNums: [23, 24],
        },
        {
          instruction: "Choose TWO letters, A–E.",
          question:
            "Which TWO opinions do both the students express about the evolutionary theory of loneliness?",
          options: [
            { letter: "A", text: "It has little practical relevance." },
            { letter: "B", text: "It needs further investigation." },
            { letter: "C", text: "It is misleading." },
            { letter: "D", text: "It should be more widely accepted." },
            { letter: "E", text: "It is difficult to understand." },
          ],
          qNums: [25, 26],
        },
      ],
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C.",
        questions: [
          {
            qNum: 27,
            text: "When comparing loneliness to depression, the students",
            options: [
              {
                letter: "A",
                text: "Doubt that there will ever be a medical cure for loneliness.",
              },
              {
                letter: "B",
                text: "Claim that the link between loneliness and mental health is overstated.",
              },
              {
                letter: "C",
                text: "Express frustration that loneliness is not taken more seriously.",
              },
            ],
          },
          {
            qNum: 28,
            text: "Why do the students decide to start their presentation with an example from their own experience?",
            options: [
              {
                letter: "A",
                text: "To explain how difficult loneliness can be",
              },
              {
                letter: "B",
                text: "To highlight a situation that most students will recognise",
              },
              {
                letter: "C",
                text: "To emphasise that feeling lonely is more common for men than women",
              },
            ],
          },
          {
            qNum: 29,
            text: "The students agree that talking to strangers is a good strategy for dealing with loneliness because",
            options: [
              { letter: "A", text: "It creates a sense of belonging." },
              { letter: "B", text: "It builds self-confidence." },
              { letter: "C", text: "It makes people feel more positive." },
            ],
          },
          {
            qNum: 30,
            text: "The students find it difficult to understand why solitude is considered to be",
            options: [
              { letter: "A", text: "Similar to loneliness." },
              { letter: "B", text: "Necessary for mental health." },
              { letter: "C", text: "An enjoyable experience." },
            ],
          },
        ],
      },
    },
    part4: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD ONLY for each answer.",
      sections: [
        {
          title: "Reclaiming Urban Rivers",
          content: [
            {
              text: "Historical Background\nNearly all major cities were built on a river.\nRivers were traditionally used for transport, fishing, and recreation.\nIndustrial development and rising populations later led to:\n- More sewage from houses being discharged into the river.\n- Pollution from ",
            },
            { blank: 31 },
            {
              text: " on the river bank.\nIn 1957, the River Thames in London was declared biologically ",
            },
            { blank: 32 },
            { text: "" },
          ],
        },
        {
          title: "Recent Improvements",
          content: [
            { text: "Seals and even a " },
            { blank: 33 },
            {
              text: " have been seen in the River Thames.\nRiverside warehouses are converted to restaurants and ",
            },
            { blank: 34 },
            {
              text: "\nIn Los Angeles, there are plans to:\nBuild a riverside ",
            },
            { blank: 35 },
            { text: "\nDisplay " },
            { blank: 36 },
            { text: " projects.\nIn Paris, " },
            { blank: 37 },
            { text: " are created on the sides of the river every summer." },
          ],
        },
        {
          title: "Transport Possibilities",
          content: [
            { text: "Over 2 billion passengers already travel by " },
            { blank: 38 },
            {
              text: " in cities around the world.\nChanges in shopping habits mean the number of deliveries that are made is increasing.\nInstead of road transport, goods can be transported by large freight barges and electric ",
            },
            { blank: 39 },
            { text: ", or, in future, by " },
            { blank: 40 },
            { text: "" },
          ],
        },
      ],
    },
  },
  "cambridge-20|test-4": {
    part1: cam20Test4Part1,
    part2: {
      chooseTwoBlocks: [
        {
          instruction: "Choose TWO letters, A–E",
          question:
            "Which TWO things does the speaker say about visiting the football stadium with children?",
          options: [
            {
              letter: "A",
              text: "Children can get their photo taken with a football player",
            },
            { letter: "B", text: "There is a competition for children today" },
            {
              letter: "C",
              text: "Parents must stay with their children at all times",
            },
            { letter: "D", text: "Children will need sunhats and drinks" },
            {
              letter: "E",
              text: "The café has a special offer on meals for children",
            },
          ],
          qNums: [11, 12],
        },
        {
          instruction: "Choose TWO letters, A–E",
          question: "Which TWO features of the stadium tour are new this year?",
          options: [
            { letter: "A", text: "VIP tour" },
            { letter: "B", text: "360 cinema experience" },
            { letter: "C", text: "audio guide" },
            { letter: "D", text: "dressing room tour" },
            { letter: "E", text: "tours in other languages" },
          ],
          qNums: [13, 14],
        },
      ],
      matching: {
        instruction:
          "Which event in the history of football in the UK took place in each of the following years? Choose SIX answers from the box and write the correct letter, A–H, next to questions 15–20.",
        title: "Events in the history of football",
        events: [
          { letter: "A", text: "the introduction of pay for the players" },
          { letter: "B", text: "a change to the design of the goal" },
          { letter: "C", text: "the first use of lights for matches" },
          { letter: "D", text: "the introduction of goalkeepers" },
          { letter: "E", text: "the first international match" },
          { letter: "F", text: "two changes to the rules of the game" },
          { letter: "G", text: "the introduction of a fee for spectators" },
          { letter: "H", text: "an agreement on the length of a game" },
        ],
        years: [
          { qNum: 15, year: 1870 },
          { qNum: 16, year: 1874 },
          { qNum: 17, year: 1875 },
          { qNum: 18, year: 1877 },
          { qNum: 19, year: 1878 },
          { qNum: 20, year: 1880 },
        ],
      },
    },
    part3: {
      chooseTwoBlocks: [
        {
          instruction: "Choose TWO letters, A–E",
          question:
            "Which TWO benefits for children of learning to write did both students find surprising?",
          options: [
            { letter: "A", text: "improved fine motor skills" },
            { letter: "B", text: "improved memory" },
            { letter: "C", text: "improved concentration" },
            { letter: "D", text: "improved imagination" },
            { letter: "E", text: "improved spatial awareness" },
          ],
          qNums: [21, 22],
        },
        {
          instruction: "Choose TWO letters, A–E",
          question:
            "For children with dyspraxia, which TWO problems with handwriting do the students think are easiest to correct?",
          options: [
            { letter: "A", text: "not spacing letters correctly" },
            { letter: "B", text: "not writing in a straight line" },
            { letter: "C", text: "applying too much pressure when writing" },
            { letter: "D", text: "confusing letter shapes" },
            { letter: "E", text: "writing very slowly" },
          ],
          qNums: [23, 24],
        },
      ],
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C",
        questions: [
          {
            qNum: 25,
            text: "What does the woman say about using laptops to teach writing to children with dyslexia?",
            options: [
              {
                letter: "A",
                text: "Children often lack motivation to learn that way",
              },
              {
                letter: "B",
                text: "Children become fluent relatively quickly",
              },
              {
                letter: "C",
                text: "Children react more positively if they make a mistake",
              },
            ],
          },
          {
            qNum: 26,
            text: "When discussing whether to teach cursive or print writing, the woman thinks that",
            options: [
              {
                letter: "A",
                text: "cursive writing disadvantages a certain group of children",
              },
              {
                letter: "B",
                text: "print writing is associated with lower academic performance",
              },
              {
                letter: "C",
                text: "most teachers in the UK prefer a traditional approach to handwriting",
              },
            ],
          },
          {
            qNum: 27,
            text: "According to the students, what impact does poor handwriting have on exam performance?",
            options: [
              {
                letter: "A",
                text: "There is evidence to suggest grades are affected by poor handwriting",
              },
              {
                letter: "B",
                text: "Neat handwriting is less important now than it used to be",
              },
              {
                letter: "C",
                text: "Candidates write more slowly and produce shorter answers",
              },
            ],
          },
          {
            qNum: 28,
            text: "What prediction does the man make about the future of handwriting?",
            options: [
              {
                letter: "A",
                text: "Touch typing will be taught before writing by hand",
              },
              {
                letter: "B",
                text: "Children will continue to learn to write by hand",
              },
              {
                letter: "C",
                text: "People will dislike handwriting on digital devices",
              },
            ],
          },
          {
            qNum: 29,
            text: "The woman is concerned that relying on digital devices has made it difficult for her to",
            options: [
              { letter: "A", text: "take detailed notes" },
              { letter: "B", text: "spell and punctuate" },
              { letter: "C", text: "read old documents" },
            ],
          },
          {
            qNum: 30,
            text: "How do the students feel about their own handwriting?",
            options: [
              {
                letter: "A",
                text: "concerned they are unable to write quickly",
              },
              { letter: "B", text: "embarrassed by comments made about it" },
              { letter: "C", text: "regretful that they have lost the habit" },
            ],
          },
        ],
      },
    },
    part4: cam20Test4Part4,
  },
  "cambridge-20|test-2": {
    part1: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD AND/OR A NUMBER for each answer.",
      sections: [
        {
          title:
            "Local Councils can Arrange Practical Support to Help those Caring for Elderly people at Home.",
          content: [
            {
              text: "This can give the carer:\n– time for other responsibilities\n– a ",
            },
            { blank: 1 },
            { text: "" },
          ],
        },
        {
          title: "Assessment of mother's needs",
          content: [
            { text: "This may include discussion of:\n– how much " },
            { blank: 2 },
            { text: " the caring involves" },
          ],
        },
        {
          title: "What types of tasks are involved, e.g.:",
          content: [
            { text: "– help with dressing\n– helping her have a " },
            { blank: 3 },
            { text: "\n– shopping\n– helping with meals\n– dealing with " },
            { blank: 4 },
            { text: "" },
          ],
        },
        {
          title: "Any aspects of caring that are especially difficult, e.g.:",
          content: [
            { text: "– loss of " },
            { blank: 5 },
            { text: "\n– " },
            { blank: 6 },
            { text: " her\n– preventing a " },
            { blank: 7 },
            { text: "" },
          ],
        },
        {
          title: "Types of support that may be offered to carers",
          content: [
            { text: "– transport costs, e.g. cost of a " },
            { blank: 8 },
            { text: "\n– car-related costs, e.g. fuel and " },
            { blank: 9 },
            { text: "\n– help with housework\n– help to reduce " },
            { blank: 10 },
            { text: "" },
          ],
        },
      ],
    },
    part2: {
      matchingRole: {
        instruction:
          "What is the role of the volunteers in each of the following activities? Choose SIX answers from the box and write the correct letter, A–I, next to Questions 11–16.",
        title: "Community Volunteering and Local Festival Events",
        options: [
          { letter: "A", text: "providing entertainment" },
          { letter: "B", text: "providing publicity about a council service" },
          { letter: "C", text: "contacting local businesses" },
          { letter: "D", text: "giving advice to visitors" },
          { letter: "E", text: "collecting feedback on events" },
          { letter: "F", text: "selling tickets" },
          { letter: "G", text: "introducing guest speakers at an event" },
          {
            letter: "H",
            text: "encouraging cooperation between local organisations",
          },
          { letter: "I", text: "helping people find their seats" },
        ],
        items: [
          { qNum: 11, text: "walking around the town centre" },
          { qNum: 12, text: "helping at concerts" },
          { qNum: 13, text: "getting involved with community groups" },
          { qNum: 14, text: "helping with a magazine" },
          { qNum: 15, text: "participating at lunches for retired people" },
          { qNum: 16, text: "helping with the website" },
        ],
      },
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C.",
        questions: [
          {
            qNum: 17,
            text: "Which event requires the largest number of volunteers?",
            options: [
              { letter: "A", text: "the music festival" },
              { letter: "B", text: "the science festival" },
              { letter: "C", text: "the book festival" },
            ],
          },
          {
            qNum: 18,
            text: "What is the most important requirement for volunteers at the festivals?",
            options: [
              { letter: "A", text: "interpersonal skills" },
              { letter: "B", text: "personal interest in the event" },
              { letter: "C", text: "flexibility" },
            ],
          },
          {
            qNum: 19,
            text: "New volunteers will start working in the week beginning",
            options: [
              { letter: "A", text: "2 September" },
              { letter: "B", text: "9 September" },
              { letter: "C", text: "23 September" },
            ],
          },
          {
            qNum: 20,
            text: "What is the next annual event for volunteers?",
            options: [
              { letter: "A", text: "a boat trip" },
              { letter: "B", text: "a barbecue" },
              { letter: "C", text: "a party" },
            ],
          },
        ],
      },
    },
    part3: {
      matching: {
        instruction:
          "What is Rosie and Colin's opinion about each of the following aspects of human geography? Choose FIVE answers from the box and write the correct letter, A–G, next to Questions 21–25.",
        options: [
          {
            letter: "A",
            text: "The information given about this was too vague.",
          },
          { letter: "B", text: "This may not be relevant to their course." },
          {
            letter: "C",
            text: "This will involve only a small number of statistics.",
          },
          { letter: "D", text: "It will be easy to find facts about this." },
          { letter: "E", text: "The facts about this may not be reliable." },
          { letter: "F", text: "No useful research has been done on this." },
          {
            letter: "G",
            text: "The information provided about this was interesting.",
          },
        ],
        items: [
          { qNum: 21, text: "Population" },
          { qNum: 22, text: "Health" },
          { qNum: 23, text: "Economies" },
          { qNum: 24, text: "Culture" },
          { qNum: 25, text: "Poverty" },
        ],
      },
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C.",
        questions: [
          {
            qNum: 26,
            text: "Rosie says that in her own city the main problem is",
            options: [
              { letter: "A", text: "Crime" },
              { letter: "B", text: "Housing" },
              { letter: "C", text: "Unemployment" },
            ],
          },
          {
            qNum: 27,
            text: "What recent additions to the outskirts of their cities are both students happy about?",
            options: [
              { letter: "A", text: "Conference centres" },
              { letter: "B", text: "Sports centres" },
              { letter: "C", text: "Retail centres" },
            ],
          },
          {
            qNum: 28,
            text: "The students agree that developing disused industrial sites may",
            options: [
              { letter: "A", text: "Have unexpected costs" },
              { letter: "B", text: "Damage the urban environment" },
              { letter: "C", text: "Destroy valuable historical buildings" },
            ],
          },
          {
            qNum: 29,
            text: "The students will mention Masdar City as an example of an attempt to achieve",
            options: [
              { letter: "A", text: "Daily collections for waste recycling" },
              { letter: "B", text: "Sustainable energy use" },
              { letter: "C", text: "Free transport for everyone" },
            ],
          },
          {
            qNum: 30,
            text: "When discussing the ecotown of Greenhill Abbots, Colin is uncertain about",
            options: [
              { letter: "A", text: "What its objectives were" },
              { letter: "B", text: "Why there was opposition to it" },
              { letter: "C", text: "How much of it has actually been built" },
            ],
          },
        ],
      },
    },
    part4: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD ONLY for each answer.",
      sections: [
        {
          title: "Developing Food Trends",
          content: [
            { text: "The growth in interest in food fashions started with " },
            { blank: 31 },
            {
              text: " of food being shared on social media.\nThe UK food industry is constantly developing products which are new or different.\nInfluencers on social media become 'ambassadors' for a brand.\nSales of ",
            },
            { blank: 32 },
            {
              text: " food brands have grown rapidly this way.\nSupermarkets track demand for ingredients on social media.\nFamous ",
            },
            { blank: 33 },
            { text: " are influential." },
          ],
        },
        {
          title: "Marketing campaigns",
          content: [
            { text: "The avocado:\n— " },
            { blank: 34 },
            {
              text: " were invited to visit growers in South Africa.\n— Advertising focused on its ",
            },
            { blank: 35 },
            { text: " benefits." },
          ],
        },
        {
          title: "Oat milk:",
          content: [
            {
              text: "— A Swedish brand's media campaign received publicity by upsetting competitors.\n— Promotion in the USA through ",
            },
            { blank: 36 },
            {
              text: " shops reduced the need for advertising.\n— It appealed to consumers who are concerned about the ",
            },
            { blank: 37 },
            { text: "" },
          ],
        },
        {
          title: "Norwegian skrei:",
          content: [
            { text: "— has helped strengthen the " },
            { blank: 38 },
            { text: " of Norwegian seafood." },
          ],
        },
        {
          title: "Ethical concerns – Quinoa:",
          content: [
            { text: "— Its success led to an increase in its " },
            { blank: 39 },
            { text: ".\n— Overuse of resources resulted in poor quality " },
            { blank: 40 },
            { text: "." },
          ],
        },
      ],
    },
  },
  "cambridge-20|test-3": {
    part1: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD AND/OR A NUMBER for each answer.",
      title: "Furniture Rental Companies",
      columns: [
        "Name of company",
        "Information about costs",
        "Additional notes",
      ],
      rows: [
        {
          name: [{ text: "Peak Rentals" }],
          costs: [
            { text: "Prices range from $105 to $ " },
            { blank: 1 },
            { text: " per room per month." },
          ],
          notes: [
            { text: "The furniture is very " },
            { blank: 2 },
            { text: "\nDelivers in 1-2 days\nSpecial offer:\nfree " },
            { blank: 3 },
            { text: " with every living room set" },
          ],
        },
        {
          name: [{ blank: 4 }, { text: " and Oliver" }],
          costs: [
            { text: "Mid-range prices\n12% monthly fee for " },
            { blank: 5 },
          ],
          notes: [{ text: "Also offers a cleaning service" }],
        },
        {
          name: [{ text: "Larch Furniture" }],
          costs: [
            { text: "Offers cheapest prices for renting furniture and " },
            { blank: 6 },
            { text: " items" },
          ],
          notes: [
            { text: "Must have own " },
            { blank: 7 },
            { text: "\nMinimum contract length: six months" },
          ],
        },
        {
          name: [{ blank: 8 }, { text: " Rentals" }],
          costs: [
            { text: "See the " },
            { blank: 9 },
            { text: " for the most up-to-date prices" },
          ],
          notes: [
            { blank: 10 },
            { text: " are allowed within 7 days of delivery" },
          ],
        },
      ],
    },
    part2: {
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C",
        questions: [
          {
            qNum: 11,
            text: "Who was responsible for starting the community project?",
            options: [
              { letter: "A", text: "The castle owners" },
              { letter: "B", text: "A national charity" },
              { letter: "C", text: "The local council" },
            ],
          },
          {
            qNum: 12,
            text: "How was the gold coin found?",
            options: [
              { letter: "A", text: "Heavy rain had removed some of the soil" },
              { letter: "B", text: "The ground was dug up by wild rabbits" },
              {
                letter: "C",
                text: "A person with a metal detector searched the area",
              },
            ],
          },
          {
            qNum: 13,
            text: "What led the archaeologists to believe there was an ancient village on this site?",
            options: [
              { letter: "A", text: "The lucky discovery of old records" },
              {
                letter: "B",
                text: "The bases of several structures visible in the grass",
              },
              { letter: "C", text: "The unusual stones found near the castle" },
            ],
          },
          {
            qNum: 14,
            text: "What are the team still hoping to find?",
            options: [
              { letter: "A", text: "Everyday pottery" },
              { letter: "B", text: "Animal bones" },
              { letter: "C", text: "Pieces of jewellery" },
            ],
          },
          {
            qNum: 15,
            text: "What was found on the other side of the river to the castle?",
            options: [
              { letter: "A", text: "The remains of a large palace" },
              { letter: "B", text: "The outline of fields" },
              { letter: "C", text: "A number of small huts" },
            ],
          },
          {
            qNum: 16,
            text: "What do the team plan to do after work ends this summer?",
            options: [
              { letter: "A", text: "Prepare a display for a museum" },
              { letter: "B", text: "Take part in a television programme" },
              { letter: "C", text: "Start to organise school visits" },
            ],
          },
        ],
      },
      mapLabeling: {
        instruction:
          "Label the map below. Choose the correct letter, A–G, for each question.",
        letters: ["A", "B", "C", "D", "E", "F", "G"],
        labels: [
          { qNum: 17, text: "bridge foundations" },
          { qNum: 18, text: "rubbish pit" },
          { qNum: 19, text: "meeting hall" },
          { qNum: 20, text: "fish pond" },
        ],
        imageUrl:
          "https://i0.wp.com/engnovate.com/wp-content/uploads/2025/07/cambridge-ielts-20-academic-reading-test-3%E2%80%9317-20.png?w=690&ssl=1",
      },
    },
    part3: {
      singleChoice: {
        instruction: "Choose the correct letter, A, B or C",
        questions: [
          {
            qNum: 21,
            text: "Finn was pleased to discover that their topic",
            options: [
              { letter: "A", text: "was not familiar to their module leader" },
              { letter: "B", text: "had not been chosen by other students" },
              {
                letter: "C",
                text: "did not prove to be difficult to research",
              },
            ],
          },
          {
            qNum: 22,
            text: "Maya says a mistaken belief about theatre programmes is that",
            options: [
              { letter: "A", text: "theatres pay companies to produce them" },
              { letter: "B", text: "few theatre-goers buy them nowadays" },
              {
                letter: "C",
                text: "they contain far more adverts than previously",
              },
            ],
          },
          {
            qNum: 23,
            text: "Finn was surprised that, in early British theatre, programmes",
            options: [
              { letter: "A", text: "were difficult for audiences to obtain" },
              { letter: "B", text: "were given out free of charge" },
              { letter: "C", text: "were seen as a kind of contract" },
            ],
          },
          {
            qNum: 24,
            text: "Maya feels their project should include an explanation of why companies of actors",
            options: [
              { letter: "A", text: "promoted their own plays" },
              { letter: "B", text: "performed plays outdoors" },
              { letter: "C", text: "had to tour with their plays" },
            ],
          },
          {
            qNum: 25,
            text: "Finn and Maya both think that, compared to nineteenth-century programmes, those from the eighteenth century",
            options: [
              { letter: "A", text: "were more original" },
              { letter: "B", text: "were more colourful" },
              { letter: "C", text: "were more informative" },
            ],
          },
          {
            qNum: 26,
            text: "Maya doesn't fully understand why, in the twentieth century,",
            options: [
              {
                letter: "A",
                text: "very few theatre programmes were printed in the USA",
              },
              {
                letter: "B",
                text: "British theatre programmes failed to develop for so long",
              },
              {
                letter: "C",
                text: "theatre programmes in Britain copied fashions from the USA",
              },
            ],
          },
        ],
      },
      matching: {
        instruction:
          "What comment is made about the programme for each of the following shows? Choose FOUR answers from the box and write the correct letter, A–F.",
        title: "Comments about the programme",
        optionsPlainList: true,
        options: [
          {
            letter: "A",
            text: "Its origin is somewhat controversial",
          },
          { letter: "B", text: "It is historically significant for a country" },
          { letter: "C", text: "It was effective at attracting audiences" },
          { letter: "D", text: "It is included in a recent project" },
          { letter: "E", text: "It contains insights into the show" },
          { letter: "F", text: "It resembles an artwork" },
        ],
        items: [
          { qNum: 27, text: "Ruy Blas" },
          { qNum: 28, text: "Man of La Mancha" },
          { qNum: 29, text: "The Tragedy of Jane Shore" },
          { qNum: 30, text: "The Sailors' Festival" },
        ],
      },
    },
    part4: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD ONLY for each answer.",
      sections: [
        {
          title: "I. Inclusive Design",
          content: [
            {
              text: "Definition:\n- Designing products that can be accessed by a diverse range of people without the need for any ",
            },
            { blank: 31 },
            {
              text: ".\n- Not the same as universal design: that is design for everyone, including catering for people with ",
            },
            { blank: 32 },
            { text: " problems." },
          ],
        },
        {
          title: "Examples of Inclusive Design:",
          content: [
            { text: "- " },
            { blank: 33 },
            {
              text: " which are adjustable, avoiding back or neck problems\n- ",
            },
            { blank: 34 },
            { text: " in public toilets which are easier to use" },
          ],
        },
        {
          title: "To assist the elderly:",
          content: [
            { text: "- Designers avoid using " },
            { blank: 35 },
            {
              text: " in interfaces\n- People can make commands using a mouse, keyboard, or their ",
            },
            { blank: 36 },
            { text: "" },
          ],
        },
        {
          title: "II. Impact of Non-Inclusive Designs",
          content: [
            { text: "Access:\n- Loss of independence for disabled people." },
          ],
        },
        {
          title: "Safety:",
          content: [
            { text: "- Seatbelts are especially problematic for " },
            { blank: 37 },
            {
              text: " women.\n- PPE jackets are often unsuitable because of the size of women's ",
            },
            { blank: 38 },
            { text: ".\n- PPE for female " },
            { blank: 39 },
            { text: " officers dealing with emergencies is the worst." },
          ],
        },
        {
          title: "Comfort in the Workplace:",
          content: [
            { text: "- The " },
            { blank: 40 },
            { text: " in offices is often too low for women." },
          ],
        },
      ],
    },
  },
};
const cam10Test1Override: Record<string, Partial<PartContentMap>> = {
  "cambridge-10|test-1": {
    part1: {
      instruction: "Complete the notes below.",
      instructionSub: "Write ONE WORD AND/OR A NUMBER for each answer.",
      sections: [
        {
          title: "SELF-DRIVE TOURS IN THE USA",
          content: [
            { text: "Example\nName: Andrea Brown\n\nDetails:\n" },
            { text: "Address: 24 " },
            { blank: 1 },
            {
              text: " Road\nPostcode: BH5 2QP\nPhone: (mobile) 077 8684 3091\nHeard about company from: ",
            },
            { blank: 2 },
            {
              text: "\n\nPossible self-drive tours:\n\nTrip One:\nLos Angeles: customer wants to visit some ",
            },
            { blank: 3 },
            {
              text: " parks with her children\nYosemite Park: customer wants to stay in a lodge, not a ",
            },
            { blank: 4 },
            {
              text: "\n\nTrip Two:\nCustomer wants to see the ",
            },
            { blank: 5 },
            {
              text: " on the way to Cumbria\nAt Santa Monica: not interested in shopping\nAt San Diego, wants to spend time on the ",
            },
            { blank: 6 },
            { text: "\n\n" },
          ],
        },
      ],
      table: {
        title: "",
        columns: [
          "",
          "Number of days",
          "Total distance",
          "Price (per person) / Includes",
        ],
        rows: [
          {
            name: [{ text: "Trip One" }],
            location: [{ text: "12 days" }],
            reason: [{ text: "" }, { blank: 7 }, { text: " km" }],
            other: [{ text: "£525\n• accommodation\n• car\n• " }, { blank: 8 }],
          },
          {
            name: [{ text: "Trip Two" }],
            location: [{ text: "9 days" }],
            reason: [{ text: "980 km" }],
            other: [
              { text: "£" },
              { blank: 9 },
              { text: "\n• accommodation\n• " },
              { blank: 10 },
            ],
          },
        ],
      },
    },
    part2: {
      notesCompletion: {
        instruction: "Complete the notes below.",
        instructionSub: "Write NO MORE THAN TWO WORDS for each answer.",
        sections: [
          {
            title: "Joining the leisure club – Personal Assessment",
            content: [
              { text: "New members should describe any " },
              { blank: 13 },
              { text: ".\nThe " },
              { blank: 14 },
              {
                text: " will be explained to you before you use the equipment.\nYou will be given a six-week ",
              },
              { blank: 15 },
              { text: "." },
            ],
          },
          {
            title: "Types of membership",
            content: [
              { text: "There is a compulsory £90 " },
              { blank: 16 },
              { text: " fee for members.\nGold members are given " },
              { blank: 17 },
              {
                text: " to all the LP clubs.\nPremier members are given priority during ",
              },
              { blank: 18 },
              { text: " hours.\nPremier members can bring some " },
              { blank: 19 },
              { text: " every month.\nMembers should always take their " },
              { blank: 20 },
              { text: " with them." },
            ],
          },
        ],
      },
    },
    part3: {
      notesCompletion: {
        instruction: "Complete the notes below.",
        instructionSub: "Write ONE WORD ONLY for each answer.",
        sections: [
          {
            title: "",
            content: [
              { text: "John needs help preparing for his " },
              { blank: 26 },
              { text: ".\nThe professor advises John to make a " },
              { blank: 27 },
              {
                text: " of his design.\nJohn's main problem is getting good quality ",
              },
              { blank: 28 },
              { text: ".\nThe professor suggests John apply for a " },
              { blank: 29 },
              { text: ".\nThe professor will check the " },
              { blank: 30 },
              { text: " information in John's written report." },
            ],
          },
        ],
      },
    },
  },
};
const cam10Test4Part4: Part4ContentData = {
  singleChoice: {
    instruction: "Choose the correct letter, A, B or C.",
    title: "Nanotechnology: technology on a small scale",
    questions: [
      {
        qNum: 31,
        text: "The speaker says that one problem with nanotechnology is that",
        options: [
          { letter: "A", text: "it could threaten our way of life." },
          { letter: "B", text: "it could be used to spy on people." },
          { letter: "C", text: "it is misunderstood by the public." },
        ],
      },
      {
        qNum: 32,
        text: "According to the speaker, some scientists believe that nono-particles",
        options: [
          { letter: "A", text: "should be restricted to secure environments." },
          { letter: "B", text: "should be used with more caution." },
          {
            letter: "C",
            text: "should only be developed for essential products.",
          },
        ],
      },
      {
        qNum: 33,
        text: "In the speaker's opinion, research into nanotechnology",
        options: [
          { letter: "A", text: "has yet to win popular support." },
          { letter: "B", text: "could be seen as unethical." },
          { letter: "C", text: "ought to be continued." },
        ],
      },
    ],
  },
  notes: {
    instruction: "Complete the notes below.",
    instructionSub: "Write ONE WORD ONLY for each answer.",
    title: "Uses of Nanotechnology",
    sections: [
      {
        title: "Transport",
        content: [
          { text: "Nanotechnology could allow the development of stronger " },
          { blank: 34 },
          { text: "\nPlanes would be much lighter in weight.\n" },
          { blank: 35 },
          { text: " travel will be made available to the masses." },
        ],
      },
      {
        title: "Technology",
        content: [
          {
            text: "Computers will be even smaller, faster, and will have a greater ",
          },
          { blank: 36 },
          { text: "\n" },
          { blank: 37 },
          { text: " Energy will become more affordable." },
        ],
      },
      {
        title: "The Environment",
        content: [
          {
            text: "Nano-robots could rebuild the ozone layer.\nPollutants such as ",
          },
          { blank: 38 },
          { text: " could be removed from water\nThere will be no " },
          { blank: 39 },
          { text: " from manufacturing." },
        ],
      },
      {
        title: "Health and Medicine",
        content: [
          {
            text: "New methods of food production could eradicate famine.\nAnalysis of medical ",
          },
          { blank: 40 },
          { text: " will be speeded up.\nLife expectancy could be increased." },
        ],
      },
    ],
  },
};
const contentByTest: Record<string, PartContentMap> = {
  ...(engnovatePartContent as unknown as Record<string, PartContentMap>),
  ...cambridge20Content,
};
export function getPartContent(setId: string, testId: string): PartContentMap {
  const key = `${setId}|${testId}`;
  const base = contentByTest[key] ?? {};
  const override = cam10Test1Override[key];
  let result: PartContentMap = base;
  if (override && Object.keys(override).length > 0) {
    result = {
      ...base,
      ...(override.part1 && { part1: override.part1 }),
      ...(override.part2 && {
        part2: {
          ...(base.part2 as object),
          ...override.part2,
        } as PartContentMap["part2"],
      }),
      ...(override.part3 && {
        part3: {
          ...(base.part3 as object),
          ...override.part3,
        } as PartContentMap["part3"],
      }),
    };
  }
  if (key === "cambridge-10|test-4") {
    result = { ...result, part4: cam10Test4Part4 };
  } else {
    const cam1019 =
      listeningPartContentCam1019[
        key as keyof typeof listeningPartContentCam1019
      ];
    if (cam1019?.part4) {
      result = {
        ...result,
        part4: cam1019.part4 as PartContentMap["part4"],
      };
    }
  }
  const patch = listeningPartContentPatches[key];
  if (patch) {
    result = {
      ...result,
      ...(patch.part1 && { part1: patch.part1 }),
      ...(patch.part2 && {
        part2: {
          ...(result.part2 as object),
          ...patch.part2,
        } as PartContentMap["part2"],
      }),
      ...(patch.part3 && {
        part3: {
          ...(result.part3 as object),
          ...patch.part3,
        } as PartContentMap["part3"],
      }),
      ...(patch.part4 && { part4: patch.part4 }),
    };
  }
  return result;
}
export function hasTestContent(setId: string, testId: string): boolean {
  return `${setId}|${testId}` in contentByTest;
}
export function getChooseTwoBlocksForPart(
  partContent: PartContentMap,
  part: 2 | 3,
): ChooseTwoBlock[] | undefined {
  if (part === 2)
    return (partContent.part2 as Part2ContentData | undefined)?.chooseTwoBlocks;
  if (part === 3)
    return (partContent.part3 as Part3ContentData | undefined)?.chooseTwoBlocks;
  return undefined;
}
