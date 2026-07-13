import re

with open('backend/app/pages/tester.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add CSS
css_to_add = """
    .action-btn-circle {
      background: #B1A9FF;
      border-radius: 50%;
      aspect-ratio: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 2px 2px 8px rgba(0,0,0,0.2), inset -2px -2px 5px rgba(0,0,0,0.1), inset 2px 2px 5px rgba(255,255,255,0.3);
      color: #333;
      font-weight: bold;
    }
    .action-btn-circle:active {
      box-shadow: inset 2px 2px 5px rgba(0,0,0,0.3);
      background: #9D94F4;
    }
"""
content = content.replace('/* ---- Modals (dialogue-style, centered card) ---- */', css_to_add + '\n  /* ---- Modals (dialogue-style, centered card) ---- */')

# 2. Modify pet-box
pet_box_old = """    <div class="pet-box">
      <div class="pet-image-wrap">
        <img class="pet-image" id="petImage" src="/static/pet/pet_egg_fly_01.png" alt="pet">
        <div class="pet-emoji hidden" id="petEmoji">👻</div>
        <span class="pet-overlay-icon hidden" id="petSickIcon">😷</span>
        <span class="pet-poop-badge hidden" id="petPoopBadge"></span>
      </div>
      <div class="stage-text" id="stageText">Stage: EGG</div>
    </div>"""

pet_box_new = """    <div class="pet-box" onclick="showStatsModal()" style="cursor: pointer;">
      <div class="pet-image-wrap">
        <img class="pet-image" id="petImage" src="/static/pet/pet_egg_fly_01.png" alt="pet">
        <div class="pet-emoji hidden" id="petEmoji">👻</div>
        <span class="pet-overlay-icon hidden" id="petSickIcon">😷</span>
        <span class="pet-poop-badge hidden" id="petPoopBadge"></span>
      </div>
      <div class="stage-text" id="stageText">Stage: EGG</div>
      <div style="width: 232px; height: 41px; background: #EEECFF; border-radius: 17.5px; margin-top: 15px; position: relative; overflow: hidden;">
        <div id="heartBarFill" style="height: 100%; width: 50%; background: #FFCA28; transition: width 0.3s; border-radius: 17.5px; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap;">
          <span style="font-size: 20px;">❤️❤️❤️❤️❤️</span>
        </div>
      </div>
    </div>"""
content = content.replace(pet_box_old, pet_box_new)

# 3. Hide stats card
content = content.replace('<div class="stats-card">', '<div class="stats-card hidden" id="statsCard">')

# 4. Modals HTML
modals_html = """
    <!-- 상세 상태 모달 -->
    <div id="statsModal" class="overlay hidden">
      <div class="card" style="max-width: 400px; max-height: 80vh; overflow-y: auto;">
        <div class="card-title">📊 상세 상태</div>
        <div id="modalStatsContent"></div>
        <button class="close-btn" onclick="document.getElementById('statsModal').classList.add('hidden')" style="background:#eee; border-radius:8px; margin-top: 15px; font-weight:bold;">닫기</button>
      </div>
    </div>
"""
content = content.replace('    <div id="aliveActions">', modals_html + '\n    <div id="aliveActions">')

# 5. aliveActions buttons
actions_old = """      <!-- 11번: 청소/목욕/예방접종/놀아주기/쓰다듬기는 상시 버튼이 아니라 위 퀘스트 배너로만 해결한다.
           밥주기만 상시 버튼으로 남지만, 시간대 슬롯 밖이거나 이미 그 끼니를 줬으면 가챠가 열리지 않는다. -->
      <div class="action-row">
        <button class="action-btn" id="feedBtn" onclick="handleFeedPress()">부화시키기 🥚</button>
        <button class="action-btn" id="talkBtn" onclick="openTalkMenu()">대화하기 💬</button>
      </div>
      <div class="action-row" id="healthRow">
        <button class="action-btn medicine hidden" id="medicineBtn" onclick="doGiveMedicine()">약주기 💊</button>
      </div>"""

actions_new = """      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
        <div class="action-btn-circle" onclick="doCleanAction()"><span style="font-size: 24px;">🧹</span><br><span style="font-size: 11px;">청소</span></div>
        <div class="action-btn-circle" onclick="showStatsModal()"><span style="font-size: 24px;">⚖️</span><br><span style="font-size: 11px;">상태</span></div>
        <div class="action-btn-circle" onclick="openTalkMenu()"><span style="font-size: 24px;">💬</span><br><span style="font-size: 11px;">대화</span></div>
        <div class="action-btn-circle" onclick="doPetAction()"><span style="font-size: 24px;">😊</span><br><span style="font-size: 11px;">쓰다듬</span></div>
        
        <div class="action-btn-circle" id="feedBtn" onclick="handleFeedPress()"><span style="font-size: 24px;">🍚</span><br><span style="font-size: 11px;">밥주기</span></div>
        <div class="action-btn-circle" onclick="doBatheAction()"><span style="font-size: 24px;">🛁</span><br><span style="font-size: 11px;">목욕</span></div>
        <div class="action-btn-circle" onclick="doPlayAction()"><span style="font-size: 24px;">⚽</span><br><span style="font-size: 11px;">놀기</span></div>
        <div class="action-btn-circle" id="medicineBtn" onclick="handleMedicineAction()"><span style="font-size: 24px;">💊</span><br><span style="font-size: 11px;">약/예방</span></div>
      </div>
      <div id="healthRow" class="hidden"></div>"""
content = content.replace(actions_old, actions_new)

# 6. JS logic for rendering heartbar
js_render_old = """      // pet stage text
      const stMap = { 'egg': '알', 'baby': '아기', 'child': '어린이', 'adult': '어른', 'senior': '어르신' };
      document.getElementById('stageText').innerText = `Stage: ${state.petStage.toUpperCase()}`;"""

js_render_new = """      // pet stage text
      const stMap = { 'egg': '알', 'baby': '아기', 'child': '어린이', 'adult': '어른', 'senior': '어르신' };
      document.getElementById('stageText').innerText = `Stage: ${state.petStage.toUpperCase()}`;
      // happiness heart bar
      document.getElementById('heartBarFill').style.width = Math.max(0, Math.min(100, state.spirit_happiness)) + '%';"""
content = content.replace(js_render_old, js_render_new)

# 7. Add new functions at the end of script
js_funcs = """
function showStatsModal() {
  const content = document.getElementById('statsCard').innerHTML;
  document.getElementById('modalStatsContent').innerHTML = content;
  document.getElementById('statsModal').classList.remove('hidden');
}

function doCleanAction() {
  doClean(); // original function
}
function doPetAction() {
  doPet(); // original function
}
function doBatheAction() {
  doBathe(); // original function
}
function doPlayAction() {
  doPlay(); // original function
}
function handleMedicineAction() {
  if (state.physical_health === 'sick') doGiveMedicine();
  else doVaccinate();
}
</script>
"""
content = content.replace('</script>', js_funcs)

# Update the hasMatchingActiveQuest bypass in petStore functions
content = content.replace("if (!hasMatchingActiveQuest(state, 'play')) return;", "// if (!hasMatchingActiveQuest(state, 'play')) return;")
content = content.replace("if (!hasMatchingActiveQuest(state, 'clean')) return;", "// if (!hasMatchingActiveQuest(state, 'clean')) return;")
content = content.replace("if (!hasMatchingActiveQuest(state, 'bathe')) return;", "// if (!hasMatchingActiveQuest(state, 'bathe')) return;")
content = content.replace("if (!hasMatchingActiveQuest(state, 'pet')) return;", "// if (!hasMatchingActiveQuest(state, 'pet')) return;")
content = content.replace("if (!hasMatchingActiveQuest(state, 'vaccinate')) return;", "// if (!hasMatchingActiveQuest(state, 'vaccinate')) return;")

with open('backend/app/pages/tester.html', 'w', encoding='utf-8') as f:
    f.write(content)
