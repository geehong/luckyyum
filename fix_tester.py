import re

with open("backend/app/pages/tester.html", "r") as f:
    content = f.read()

# Fix handleFeedPress
content = re.sub(
    r"function handleFeedPress\(\) \{\n  if \(state\.petStage === 'egg'\) \{ doFeed\(\); return; \}\n  doOpenMealGacha\(\);\n  if \(\!state\.spirit_mealGacha\) \{\n    alert\('지금은 밥 줄 시간이 아니에요\.\\n아침\(05~11시\)·점심\(11~17시\)·저녁\(17~23시\)에 다시 시도해주세요\.\\n이미 이번 끼니를 줬을 수도 있어요\.'\);\n  \}\n\}",
    r"function handleFeedPress() {\n  if (state.petStage === 'egg') { showToast('아직 알 상태라서 밥을 먹을 수 없어요.'); return; }\n  doOpenMealGacha();\n  if (!state.spirit_mealGacha) {\n    alert('지금은 밥 줄 시간이 아니에요.\\n아침(05~11시)·점심(11~17시)·저녁(17~23시)에 다시 시도해주세요.\\n이미 이번 끼니를 줬을 수도 있어요.');\n  }\n}",
    content
)

# Remove the duplicate functions block at the end
content = re.sub(
    r"function handleFeedPress\(\) \{\n  if \(state\.petStage === 'egg'\) \{\n    showToast\('아직 알 상태라서 밥을 먹을 수 없어요\.'\);\n    return;\n  \}\n  document\.getElementById\('mealModal'\)\.classList\.remove\('hidden'\);\n\}\n\nfunction doCleanAction\(\) \{\n  doClean\(\); // original function\n\}\nfunction doPetAction\(\) \{\n  doPet\(\); // original function\n\}\nfunction doBatheAction\(\) \{\n  if \(state\.petStage === 'egg'\) \{\n    if \(\!state\.petName\) \{\n      state\.petName = '럭키얌'; // 기본 이름 부여\n    \}\n    doFeed\(\); // 알 부화 로직\n    showToast\('따뜻하게 품어주었더니 알이 부화했습니다!'\);\n    return;\n  \}\n  doBathe\(\); // original function\n\}\nfunction doPlayAction\(\) \{\n  doPlay\(\); // original function\n\}\nfunction handleMedicineAction\(\) \{\n  if \(state\.physical_health === 'sick'\) doGiveMedicine\(\);\n  else doVaccinate\(\);\n\}\n",
    r"",
    content
)

with open("backend/app/pages/tester.html", "w") as f:
    f.write(content)
