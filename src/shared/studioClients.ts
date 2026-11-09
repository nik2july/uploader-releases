import type { StudioClientData, StudioDeliverableItem } from "./contracts";

export function categorizeStudioDeliverable(title: string, category?: string): 'video' | 'photo' {
  const t = (title || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (c === 'video') return 'video';
  if (c === 'photo' || c === 'album' || c === 'frame') return 'photo';
  if (
    t.includes('film') ||
    t.includes('teaser') ||
    t.includes('trailer') ||
    t.includes('reel') ||
    t.includes('cut') ||
    t.includes('cinema') ||
    t.includes('video') ||
    t.includes('documentary') ||
    t.includes('coverage') ||
    t.includes('4k') ||
    t.includes('mins') ||
    t.includes('raw footage')
  ) {
    return 'video';
  }
  return 'photo';
}

export function getStandardVideoDeliverables(clientName: string): StudioDeliverableItem[] {
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [
    {
      id: `deliv-vid-1-${slug}`,
      title: 'Edited Film',
      category: 'video',
      format: '16:9 4K Cinema',
      status: 'todo',
      currentCut: 'Cut 1',
      renderFilePath: '',
      dropboxShareUrl: '',
      notes: 'Long Form · Raw footage basis'
    },
    {
      id: `deliv-vid-raw-${slug}`,
      title: 'Transcoded Raw Clips (Rec.709)',
      category: 'video',
      format: 'Batch MP4 (Rec.709)',
      status: 'todo',
      currentCut: 'Rushes Package',
      renderFilePath: '',
      dropboxShareUrl: '',
      notes: 'Color-graded S-Log3 raw rushes for client viewing & download'
    }
  ];
}

export function getStandardPhotoDeliverables(clientName: string): StudioDeliverableItem[] {
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [
    {
      id: `deliv-pho-1-${slug}`,
      title: 'All Photos - Sharable Link with Face Access',
      category: 'photo',
      status: 'todo',
      notes: 'Guest-wise AI face recognition gallery link.'
    },
    {
      id: `deliv-pho-2-${slug}`,
      title: '200 Edited Photos',
      category: 'photo',
      status: 'todo',
      notes: 'High-resolution magazine retouched images.'
    }
  ];
}

export const STUDIO_WEB_APP_CLIENTS: StudioClientData[] = [
  {
    "id": "1788286042973",
    "name": "Dhanur & Jhanvi",
    "phone": "+1(647)862-8537",
    "events": [
      {
        "eventName": "Wedding",
        "date": "2026-10-28",
        "cinematographers": [
          "Kishan"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_9b663cac-1b05-43e1-8079-68453b272db5_2",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_9b663cac-1b05-43e1-8079-68453b272db5_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_9b663cac-1b05-43e1-8079-68453b272db5_1",
        "title": "200 Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "1788174388944",
    "name": "Batra Ji",
    "phone": "+919876670337",
    "events": [
      {
        "eventName": "Shagan & Mehandi",
        "date": "2026-09-11",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Wedding",
        "date": "2026-09-13",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Haldi & Sangeet",
        "date": "2026-09-12",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1789563328207_fv7h",
        "title": "Reels",
        "category": "video",
        "status": "todo",
        "format": "9:16 Vertical",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1789563394637_xhzn",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1789567473291_ysmm",
        "title": "Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1789563295178_8ef8",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1789563347899_7n00",
        "title": "Instagram Post",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1789563385454_kj3e",
        "title": "Two Album or 40Sheets/200 Each",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1789563433366_rz7b",
        "title": "20 x 30 Inches Frame",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "86279534825804",
    "name": "BeeSolver",
    "phone": "+916284993659",
    "events": [
      {
        "eventName": "Ofc Event",
        "date": "2026-10-23",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_2075f656-44ce-46aa-9071-4d2e97ceb5d6_0",
        "title": "Edited Film for Each Event",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_2075f656-44ce-46aa-9071-4d2e97ceb5d6_1",
        "title": "Trailer (5 Mins)",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_2075f656-44ce-46aa-9071-4d2e97ceb5d6_4",
        "title": "Reel",
        "category": "video",
        "status": "todo",
        "format": "9:16 Vertical",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_2075f656-44ce-46aa-9071-4d2e97ceb5d6_2",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_2075f656-44ce-46aa-9071-4d2e97ceb5d6_3",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "preset_chetan",
    "name": "Chetan & Manpreet",
    "phone": "",
    "events": [
      {
        "eventName": "Wedding",
        "date": "2026-11-20",
        "cinematographers": [
          "Aarav Cinema",
          "Kabir Master"
        ],
        "photographers": [
          "Nikhil (Candid)"
        ],
        "droneOperators": [
          "Sahil Drone"
        ]
      }
    ]
  },
  {
    "id": "1788946772002",
    "name": "Chirag Khurana",
    "phone": "8146056923",
    "events": [
      {
        "eventName": "Haldi & Wedding",
        "date": "2026-03-19",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1788946772002_1",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1788946772002_3",
        "title": "3 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1788946772002_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "delivered",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1788946772002_2",
        "title": "Two Album or 40Sheets/200 Each",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "8802119133319",
    "name": "Diksha",
    "phone": "7837770493",
    "events": [
      {
        "eventName": "Haldi Bride",
        "date": "2027-02-19",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Shagun Groom",
        "date": "2027-02-19",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Bhaat Bride",
        "date": "2027-02-20",
        "cinematographers": [
          "Vishal Kalia",
          "Kishan",
          "Samar"
        ],
        "photographers": [
          "Vikas Khera",
          "Pawan",
          "Hritik"
        ],
        "droneOperators": [
          "Nitin"
        ]
      },
      {
        "eventName": "Wedding (Sehrabandi included)",
        "date": "2027-02-20",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Haldi Groom",
        "date": "2026-02-20",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Mehandi & Sangeet Bride",
        "date": "2026-02-19",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Muh Dikhai (2hrs event)",
        "date": "2027-02-21",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Hritik"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_f7964e90-edb8-4fef-967d-59080fdd15d0_0",
        "title": "Trailer (5 Mins)",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_f7964e90-edb8-4fef-967d-59080fdd15d0_3",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_f7964e90-edb8-4fef-967d-59080fdd15d0_4",
        "title": "Documentary Film of 30 - 60 Mins",
        "category": "video",
        "status": "todo",
        "format": "16:9 Documentary Master",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_f7964e90-edb8-4fef-967d-59080fdd15d0_5",
        "title": "4- Reels- (3 Days working per reel)",
        "category": "video",
        "status": "todo",
        "format": "9:16 Vertical",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_f7964e90-edb8-4fef-967d-59080fdd15d0_1",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_f7964e90-edb8-4fef-967d-59080fdd15d0_2",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "55362492334882",
    "name": "Dikshant & Moren",
    "phone": "+919555555494",
    "events": [
      {
        "eventName": "Bride Haldi + Mehndi",
        "date": "2026-11-23",
        "cinematographers": [
          "Gagan"
        ],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Bride Sangeet",
        "date": "2026-11-22",
        "cinematographers": [
          "Gagan",
          "Kishan"
        ],
        "photographers": [
          "Deepinder",
          "Himanshu Photographer"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Engagement",
        "date": "2026-10-31",
        "cinematographers": [
          "Gagan",
          "Kishan"
        ],
        "photographers": [
          "Deepinder",
          "Himanshu Photographer"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Groom Haldi",
        "date": "2026-11-25",
        "cinematographers": [
          "Kishan"
        ],
        "photographers": [
          "Deepinder"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Groom Sangeet",
        "date": "2026-11-24",
        "cinematographers": [
          "Gagan",
          "Kishan"
        ],
        "photographers": [
          "Deepinder",
          "Himanshu Photographer"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Bride Chura Ceremony",
        "date": "2026-11-24",
        "cinematographers": [
          "Gagan"
        ],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Wedding",
        "date": "2026-11-25",
        "cinematographers": [
          "Gagan",
          "Vinay",
          "Kishan"
        ],
        "photographers": [
          "Deepinder",
          "Rahul",
          "Himanshu Photographer"
        ],
        "droneOperators": [
          "Nikhil"
        ]
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_84dbe48f-2614-4035-bfb9-705c8b3733b5_2",
        "title": "Edited film for each event",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Full functions, rituals, and key moments covered end-to-end."
      },
      {
        "id": "deliv_84dbe48f-2614-4035-bfb9-705c8b3733b5_3",
        "title": "Short cinematic trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Fast-paced storytelling and music showcasing the best moments."
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_84dbe48f-2614-4035-bfb9-705c8b3733b5_0",
        "title": "Face-recognition photo gallery",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "All event photos shared within 24 hours through a face-recognition gallery for guest-wise delivery."
      },
      {
        "id": "deliv_84dbe48f-2614-4035-bfb9-705c8b3733b5_1",
        "title": "Edited high-resolution photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Delivered within 7 days through an online gallery/download link."
      }
    ]
  },
  {
    "id": "237602866871058",
    "name": "Kartik Uppal",
    "phone": "+917589368415",
    "events": [
      {
        "eventName": "Roka",
        "date": "2026-10-12",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1f15be60-6b7f-47a8-b6de-c9d8bd151aff_0",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      },
      {
        "id": "deliv_1f15be60-6b7f-47a8-b6de-c9d8bd151aff_1",
        "title": "Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1f15be60-6b7f-47a8-b6de-c9d8bd151aff_2",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "preset_lipzig",
    "name": "Lipzig Engagement",
    "phone": "",
    "events": [
      {
        "eventName": "Engagement",
        "date": "2026-10-18",
        "cinematographers": [
          "Gagan"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      }
    ]
  },
  {
    "id": "preset_nandini",
    "name": "Nandini & Anubhav",
    "phone": "",
    "events": [
      {
        "eventName": "Wedding",
        "date": "2026-11-15",
        "cinematographers": [
          "Kabir Master"
        ],
        "photographers": [
          "Nikhil (Candid)"
        ],
        "droneOperators": [
          "Sahil Drone"
        ]
      }
    ]
  },
  {
    "id": "246486268530378",
    "name": "NIDHI RANA",
    "phone": "8219400149",
    "events": [
      {
        "eventName": "Wedding",
        "date": "2027-02-28",
        "cinematographers": [
          "Vishal Kalia",
          "Kishan"
        ],
        "photographers": [
          "Pawan",
          "Vikas Khera"
        ],
        "droneOperators": [
          "Nitin"
        ]
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_cd309148-21fe-42ed-8249-f372e2d4ae40_1",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      },
      {
        "id": "deliv_cd309148-21fe-42ed-8249-f372e2d4ae40_2",
        "title": "3 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_cd309148-21fe-42ed-8249-f372e2d4ae40_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_cd309148-21fe-42ed-8249-f372e2d4ae40_3",
        "title": "Gallery of 300 Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "1787990859686",
    "name": "Osheen",
    "phone": "6006970046",
    "events": [
      {
        "eventName": "Tilak",
        "date": "2026-11-11",
        "cinematographers": [
          "Gagan"
        ],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Saint",
        "date": "2026-11-12",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Wedding",
        "date": "2026-11-12",
        "cinematographers": [
          "Vishal Kalia",
          "Gagan"
        ],
        "photographers": [
          "Deepinder",
          "Nikhil",
          "Himanshu Photographer"
        ],
        "droneOperators": [
          "Nitin"
        ]
      },
      {
        "eventName": "Mehandi",
        "date": "2026-11-11",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [
          "Himanshu Photographer"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Haldi",
        "date": "2026-11-10",
        "cinematographers": [
          "Vishal Kalia",
          "Gagan"
        ],
        "photographers": [
          "Deepinder",
          "Himanshu Photographer"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Engagement",
        "date": "2026-11-09",
        "cinematographers": [
          "Vishal Kalia",
          "Gagan"
        ],
        "photographers": [
          "Deepinder",
          "Himanshu Photographer"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1787990859686_2",
        "title": "5 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787990859686_4",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1787990859686_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787990859686_1",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787990859686_3",
        "title": "Magzine",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "1789041974284",
    "name": "PRINCE JEWELLERS",
    "phone": "+919988190470",
    "events": [
      {
        "eventName": "Wedding",
        "date": "2026-11-28",
        "cinematographers": [
          "Samar",
          "Vishal Kalia",
          "Gagan"
        ],
        "photographers": [
          "Bawa",
          "Vikas Khera",
          "Himanshu Photographer"
        ],
        "droneOperators": [
          "Nitin"
        ]
      },
      {
        "eventName": "Ramayan Arambh",
        "date": "2026-10-15",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Nikhil"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Sangeet",
        "date": "2026-11-27",
        "cinematographers": [
          "Samar",
          "Vishal Kalia"
        ],
        "photographers": [
          "Bawa",
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Ramayan bhog",
        "date": "2026-10-16",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Nikhil"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Mehandi",
        "date": "2026-11-25",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Bawa"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Chithi",
        "date": "2026-11-18",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Bawa"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Mama Swagat",
        "date": "2026-11-27",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Bawa"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Haldi",
        "date": "2026-11-22",
        "cinematographers": [
          "Samar"
        ],
        "photographers": [
          "Bawa"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1789041974284_2",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      },
      {
        "id": "deliv_1789041974284_3",
        "title": "5 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1789041974284_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1789041974284_1",
        "title": "A Gallery of 500 Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "preset_ritik",
    "name": "Ritik & Isha",
    "phone": "",
    "events": [
      {
        "eventName": "Wedding",
        "date": "2026-12-05",
        "cinematographers": [
          "Aarav Cinema"
        ],
        "photographers": [
          "Pawan"
        ],
        "droneOperators": [
          "Nitin"
        ]
      }
    ]
  },
  {
    "id": "221040004937918",
    "name": "Rupali & Rajat",
    "phone": "+919915450523",
    "events": [
      {
        "eventName": "Haldi",
        "date": "2027-01-22",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Mehandi",
        "date": "2027-01-21",
        "cinematographers": [
          "Kishan"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Sangeet",
        "date": "2027-01-22",
        "cinematographers": [
          "Gagan",
          "Kishan"
        ],
        "photographers": [
          "Himanshu Photographer",
          "Vikas Khera"
        ],
        "droneOperators": [
          "Nikhil"
        ]
      },
      {
        "eventName": "Wedding",
        "date": "2027-01-23",
        "cinematographers": [
          "Kishan",
          "Gagan"
        ],
        "photographers": [
          "Himanshu Photographer",
          "Vikas Khera"
        ],
        "droneOperators": [
          "Nikhil"
        ]
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_2",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_3",
        "title": "Reels 5",
        "category": "video",
        "status": "todo",
        "format": "9:16 Vertical",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_4",
        "title": "Documentary Film of 30 - 60 Mins",
        "category": "video",
        "status": "todo",
        "format": "16:9 Documentary Master",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_5",
        "title": "Trailer (7-8)",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_1",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_6",
        "title": "Photo Frames x 4 (max.upto 20x30inhes)",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_360c9915-f86c-4b54-87c7-c4a5e9ac58cb_7",
        "title": "magzine of 12 sheets / 60 photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "189846289882766",
    "name": "Savy Gautam",
    "phone": "8427544571",
    "events": [
      {
        "eventName": "wedding",
        "date": "2026-12-11",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [
          "Himanshu Photographer",
          "Vikas Khera"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_7f0e4ade-1da6-4808-93d5-aea9701cc57e_1",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_7f0e4ade-1da6-4808-93d5-aea9701cc57e_0",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_7f0e4ade-1da6-4808-93d5-aea9701cc57e_2",
        "title": "All Photos Shared Using AI Face Recognition",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "1787988370787",
    "name": "Sparsh Garg",
    "phone": "9876326659",
    "events": [
      {
        "eventName": "Mehandi",
        "date": "2026-12-03",
        "cinematographers": [
          "Gagan"
        ],
        "photographers": [
          "Himanshu Photographer"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1787988370787_2",
        "title": "Edited Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": "Long Form · Raw footage basis"
      },
      {
        "id": "deliv_1787988370787_3",
        "title": "5 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1787988370787_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787988370787_1",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787988370787_4",
        "title": "Two Album or 40Sheets/200 Each",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "264638079595474",
    "name": "Sunidhi & Prince",
    "phone": "+917889804450",
    "events": [
      {
        "eventName": "Mehandi Bride",
        "date": "2026-11-24",
        "cinematographers": [
          "Anikait"
        ],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Haldi & Mehandi Groom",
        "date": "2026-11-24",
        "cinematographers": [],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Reception",
        "date": "2026-11-26",
        "cinematographers": [
          "Anikait"
        ],
        "photographers": [
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Wedding",
        "date": "2026-11-25",
        "cinematographers": [
          "Anikait"
        ],
        "photographers": [
          "Hritik",
          "Vikas Khera"
        ],
        "droneOperators": []
      },
      {
        "eventName": "Hawan",
        "date": "2026-11-25",
        "cinematographers": [],
        "photographers": [
          "Hritik"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_db3b8843-3dbd-4be3-9a27-4cc9396993c4_0",
        "title": "Trailer (5 Mins)",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_db3b8843-3dbd-4be3-9a27-4cc9396993c4_3",
        "title": "Edited Film for each event",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_db3b8843-3dbd-4be3-9a27-4cc9396993c4_1",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_db3b8843-3dbd-4be3-9a27-4cc9396993c4_2",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_db3b8843-3dbd-4be3-9a27-4cc9396993c4_4",
        "title": "Two Album or 40Sheets/200 Each",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "34590225063686",
    "name": "Unknown caller",
    "phone": "+919888928886",
    "events": [
      {
        "eventName": "tomorrow event",
        "date": "2026-10-28",
        "cinematographers": [],
        "photographers": [
          "Nikhil"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_517304e9-0e48-4c03-a22e-bc1e224404b4_0",
        "title": "Trailer (5 Mins)",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_517304e9-0e48-4c03-a22e-bc1e224404b4_3",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_517304e9-0e48-4c03-a22e-bc1e224404b4_1",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_517304e9-0e48-4c03-a22e-bc1e224404b4_2",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "1788105691382",
    "name": "Vibhor Gupta",
    "phone": "8146009076",
    "events": [
      {
        "eventName": "Sangeet",
        "date": "2026-12-04",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Wedding",
        "date": "2026-12-05",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Saint",
        "date": "2026-12-04",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      },
      {
        "eventName": "Haldi & Mehandi Single Event",
        "date": "2026-12-03",
        "cinematographers": [],
        "photographers": [],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1788105691382_1",
        "title": "30 - 60 Mins Cinematic Film",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1788105691382_3",
        "title": "5 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1788105691382_4",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1788105691382_0",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1788105691382_2",
        "title": "Magzine",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1788105691382_5",
        "title": "A Gallery of 500 Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "81601244796115",
    "name": "Vishesh & Shivani",
    "phone": "9864140853",
    "events": [
      {
        "eventName": "Carnival & Sangeet",
        "date": "2026-11-20",
        "cinematographers": [
          "Vishal Kalia",
          "Kishan"
        ],
        "photographers": [
          "Vikas Khera",
          "Himanshu Photographer"
        ],
        "droneOperators": [
          "Gagan"
        ]
      },
      {
        "eventName": "Wedding",
        "date": "2026-11-21",
        "cinematographers": [
          "Vishal Kalia",
          "Kishan"
        ],
        "photographers": [
          "Vikas Khera",
          "Himanshu Photographer"
        ],
        "droneOperators": [
          "Gagan"
        ]
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_853e69b4-3292-433e-9ddb-dbab3405cca9_0",
        "title": "Trailer (5 Mins)",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_853e69b4-3292-433e-9ddb-dbab3405cca9_3",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_853e69b4-3292-433e-9ddb-dbab3405cca9_5",
        "title": "Reels 3",
        "category": "video",
        "status": "todo",
        "format": "9:16 Vertical",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_853e69b4-3292-433e-9ddb-dbab3405cca9_1",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_853e69b4-3292-433e-9ddb-dbab3405cca9_2",
        "title": "Edited Photos",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_853e69b4-3292-433e-9ddb-dbab3405cca9_4",
        "title": "Magzine",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  },
  {
    "id": "1787920670163",
    "name": "Vrinda",
    "phone": "604)603-6799",
    "events": [
      {
        "eventName": "Haldi & Sangeet",
        "date": "2026-11-25",
        "cinematographers": [
          "Vishal Kalia",
          "Navi"
        ],
        "photographers": [
          "Jaspreet"
        ],
        "droneOperators": [
          "Nitin"
        ]
      },
      {
        "eventName": "Wedding",
        "date": "2026-11-26",
        "cinematographers": [
          "Vishal Kalia",
          "Navi",
          "Gagan"
        ],
        "photographers": [
          "Jaspreet",
          "Himanshu Photographer"
        ],
        "droneOperators": [
          "Nitin"
        ]
      },
      {
        "eventName": "Chuda",
        "date": "2026-11-26",
        "cinematographers": [
          "Vishal Kalia"
        ],
        "photographers": [
          "Jaspreet"
        ],
        "droneOperators": []
      }
    ],
    "videoDeliverables": [
      {
        "id": "deliv_1787920670163_1",
        "title": "5 Mins Trailer",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787920670163_2",
        "title": "3 Reels",
        "category": "video",
        "status": "todo",
        "format": "9:16 Vertical",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787920670163_3",
        "title": "Edited Film for each event in 4k",
        "category": "video",
        "status": "todo",
        "format": "16:9 4K Cinema",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ],
    "photoDeliverables": [
      {
        "id": "deliv_1787920670163_0",
        "title": "Edited Photos",
        "category": "photo",
        "status": "in_progress",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787920670163_4",
        "title": "All Photos - Sharable Link with Face Access",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787920670163_5",
        "title": "Two Album or 40Sheets/200 Each",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787920670163_6",
        "title": "100 Photos Coffee Table Book",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      },
      {
        "id": "deliv_1787920670163_7",
        "title": "Four Frames of Max 20x30 Inches",
        "category": "photo",
        "status": "todo",
        "currentCut": "Cut 1",
        "renderFilePath": "",
        "dropboxShareUrl": "",
        "notes": ""
      }
    ]
  }
];
