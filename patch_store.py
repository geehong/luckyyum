import re

with open('/home/geehong/luckyyuum/app/src/store/petStore.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add walk to interface
if 'walk: () => void;' not in content:
    content = content.replace('pet: () => void;', 'pet: () => void;\n  walk: () => void;')

# 1. chooseMealAmount
content = re.sub(
    r'(feedCount: state\.feedCount \+ 1,\n\s*dailyFortuneLock: newLock,\n\s*\.\.\.resolveQuestPatch\(state, \'feed\', newIntimacy\),\n\s*\};\n\s*\^\}\),)',
    r"feedCount: state.feedCount + 1,\n          dailyFortuneLock: newLock,\n          visual_activeAction: 'eat',\n          visual_chatMessage: '냠냠 쩝쩝!',\n          ...resolveQuestPatch(state, 'feed', newIntimacy),\n        };\n      }),",
    content
)

# wait, regex might fail due to the complexity. Let's just use string replace.
replacements = {
    "feedCount: state.feedCount + 1,\n          dailyFortuneLock: newLock,": 
    "feedCount: state.feedCount + 1,\n          dailyFortuneLock: newLock,\n          visual_activeAction: 'eat',\n          visual_chatMessage: '냠냠 쩝쩝!',",
    
    "playCount: state.playCount + 1,\n          ...resolveQuestPatch(state, 'play', newIntimacy),": 
    "playCount: state.playCount + 1,\n          visual_activeAction: 'play',\n          visual_chatMessage: '와아아 재미있다!!',\n          ...resolveQuestPatch(state, 'play', newIntimacy),",
    
    "cleanCount: state.cleanCount + 1,\n          ...resolveQuestPatch(state, 'clean', newIntimacy),": 
    "cleanCount: state.cleanCount + 1,\n          visual_activeAction: 'clean',\n          visual_chatMessage: '청소 고마워요!',\n          ...resolveQuestPatch(state, 'clean', newIntimacy),",
    
    "lastCareTime: now,\n          ...resolveQuestPatch(state, 'bathe', state.spirit_intimacy),": 
    "lastCareTime: now,\n          visual_activeAction: 'bathe',\n          visual_chatMessage: '앗 차가워! 목욕은 싫어!',\n          ...resolveQuestPatch(state, 'bathe', state.spirit_intimacy),",
    
    "petCount: state.petCount + 1,\n          ...resolveQuestPatch(state, 'pet', newIntimacy),": 
    "petCount: state.petCount + 1,\n          visual_activeAction: 'happy',\n          visual_chatMessage: '기분 좋아~ 헤헤',\n          ...resolveQuestPatch(state, 'pet', newIntimacy),",
    
    "physical_vaccinatedUntil: now + VACCINE_PROTECTION_DAYS * 24 * 60 * 60 * 1000,\n          ...resolveQuestPatch(state, 'vaccinate', state.spirit_intimacy),": 
    "physical_vaccinatedUntil: now + VACCINE_PROTECTION_DAYS * 24 * 60 * 60 * 1000,\n          visual_activeAction: 'vaccinate',\n          visual_chatMessage: '주사 아파요 ㅠㅠ',\n          ...resolveQuestPatch(state, 'vaccinate', state.spirit_intimacy),",
}

for k, v in replacements.items():
    content = content.replace(k, v)
    
walk_impl = """
      walk: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {};
        if (state.spirit_intimacy >= 100) return {};
        const now = Date.now();
        const newIntimacy = Math.min(100, state.spirit_intimacy + 5);
        return {
          spirit_intimacy: newIntimacy,
          physical_fullness: Math.max(0, state.physical_fullness - 10),
          physical_weight: Math.max(0, state.physical_weight - 2),
          lastCareTime: now,
          visual_activeAction: 'walk',
          visual_chatMessage: '산책 최고야! 룰루랄라~',
        };
      }),
"""

if 'walk: () => set' not in content:
    content = content.replace('pet: () => set((state) => {', walk_impl + '\n      pet: () => set((state) => {')

with open('/home/geehong/luckyyuum/app/src/store/petStore.ts', 'w', encoding='utf-8') as f:
    f.write(content)

