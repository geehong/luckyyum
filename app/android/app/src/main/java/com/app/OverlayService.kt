package com.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import com.tencent.mmkv.MMKV
import org.json.JSONObject

class OverlayService : Service() {

    companion object {
        // adb logcat -s LuckyYumOverlay 로 이 태그만 걸러서 볼 수 있다.
        private const val TAG = "LuckyYumOverlay"

        // migrateStorage.ts가 마이그레이션 후 지워버리는 옛 단일 "user-storage" 키 대신,
        // 지금은 petStore.ts/activityStore.ts가 각각 이 두 키에 분리 저장한다.
        private const val PET_STORE_KEY = "luckyyum-pet-store"
        private const val ACTIVITY_STORE_KEY = "luckyyum-activity-store"

        // 펫 화면 시간 분해(먹는거 > 자는거 > 노는거 > 평소모습, 우선순위 순).
        private const val EAT_DURATION_MS = 10 * 60 * 1000L // 밥 준 뒤 10분

        // 밤잠: 23~05시(6시간, gameBalance.ts MEAL_SLOTS의 "밥때 아닌 시간대"와 동일).
        private const val NIGHT_SLEEP_START_HOUR = 23
        private const val NIGHT_SLEEP_END_HOUR = 5
        // 낮잠: 오전 09~12시 + 오후 14~17시(각 3시간) = 밤잠 6시간과 합쳐 하루 총 12시간 수면.
        private val NAP_WINDOWS = listOf(9 to 12, 14 to 17)

        // 노는거: 정각 기준 하루 6번(06/09/12/15/18/21시), 매번 3분씩 — 스탯에 영향 없는 순수 연출용이라
        // 퀘스트 시스템처럼 상태 저장이 필요한 랜덤 예산제 대신 시계만 보고 계산되는 고정 슬롯으로 둔다.
        private val PLAY_BURST_HOURS = setOf(6, 9, 12, 15, 18, 21)
        private const val PLAY_BURST_DURATION_MIN = 3
    }

    private enum class PetVisualState { EAT, SLEEP, PLAY, IDLE }

    private lateinit var windowManager: WindowManager
    private lateinit var floatingView: View
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    // 롱프레스 메뉴(overlay_menu.xml)용 별도 오버레이 뷰. null이면 표시 중이 아님.
    private var menuView: View? = null
    private var longPressRunnable: Runnable? = null
    private var isLongPressTriggered = false

    private val LONG_PRESS_MS = 2000L
    private val MENU_AUTO_DISMISS_MS = 3000L
    private val ONE_HOUR_MS = 60 * 60 * 1000L
    private val DAILY_DIALOGUE_LIMIT = 5

    // 화면 밀도에 맞춘 터치 슬랍. 이걸 raw px로 고정해두면(예: 20px) 고밀도 화면에서
    // 8dp도 안 돼서, 2초간 가만히 누르고 있어도 손가락의 자연스러운 미세 떨림만으로
    // ACTION_MOVE가 임계값을 넘어 롱프레스 타이머가 계속 취소되는 버그가 생긴다.
    private val touchSlop: Int by lazy {
        android.view.ViewConfiguration.get(this).scaledTouchSlop
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()

        // Initialize MMKV
        MMKV.initialize(this)

        startForegroundService()
        createFloatingView()

        isRunning = true
        handler.post(updateRunnable)
    }

    private fun startForegroundService() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "luckyyum_overlay_channel"
            val channelName = "LuckyYum Pet Overlay"
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)

            val notification = NotificationCompat.Builder(this, channelId)
                .setContentTitle("LuckyYum Pet is active")
                .setContentText("Your pet is roaming on your screen.")
                .setSmallIcon(R.mipmap.ic_launcher)
                .build()

            startForeground(1, notification)
        }
    }

    private fun createFloatingView() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val layoutInflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater
        floatingView = layoutInflater.inflate(R.layout.overlay_pet, null)

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.LEFT
        params.x = 0
        params.y = 100

        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        // 제스처 3종 판정: 드래그(이동) / 쓰다듬기(펫 크기 범위 내 스와이프) / 롱프레스(2초, 메뉴)
        floatingView.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isLongPressTriggered = false

                    Log.d(TAG, "ACTION_DOWN — long press timer started (${LONG_PRESS_MS}ms, cancelSlop=${touchSlop * 3}px)")

                    longPressRunnable = Runnable {
                        Log.d(TAG, "long press timer fired — showing overlay menu")
                        isLongPressTriggered = true
                        showOverlayMenu()
                    }
                    handler.postDelayed(longPressRunnable!!, LONG_PRESS_MS)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()

                    // 일정 거리 이상 움직이면 롱프레스는 취소. 단, 2초 내내 완전히 고정된 자세를
                    // 유지하는 건 현실적으로 어려워 손 떨림만으로도 취소되기 쉬우므로, 일반적인
                    // 탭/스크롤 구분용 슬랍(touchSlop)보다 넉넉하게(3배) 잡아서 롱프레스가
                    // 지나치게 예민하게 취소되지 않도록 한다.
                    val longPressCancelSlop = touchSlop * 3
                    if ((Math.abs(dx) > longPressCancelSlop || Math.abs(dy) > longPressCancelSlop) && longPressRunnable != null) {
                        Log.d(TAG, "ACTION_MOVE exceeded cancelSlop (dx=$dx, dy=$dy, slop=$longPressCancelSlop) — long press cancelled")
                        handler.removeCallbacks(longPressRunnable!!)
                        longPressRunnable = null
                    }

                    if (!isLongPressTriggered) {
                        params.x = initialX + dx
                        params.y = initialY + dy
                        windowManager.updateViewLayout(floatingView, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    longPressRunnable?.let { handler.removeCallbacks(it) }
                    longPressRunnable = null

                    if (!isLongPressTriggered) {
                        val dx = Math.abs((event.rawX - initialTouchX).toInt())
                        val dy = Math.abs((event.rawY - initialTouchY).toInt())

                        // 이동량이 펫 뷰 자체의 크기 범위 이내면 쓰다듬기로 처리하고 원위치로 스냅.
                        // 그보다 크게 움직였다면 이미 ACTION_MOVE에서 반영된 드래그(이동) 결과를 그대로 둔다.
                        if (dx <= floatingView.width && dy <= floatingView.height) {
                            Log.d(TAG, "ACTION_UP — treated as PET (dx=$dx, dy=$dy, viewSize=${floatingView.width}x${floatingView.height})")
                            params.x = initialX
                            params.y = initialY
                            windowManager.updateViewLayout(floatingView, params)
                            triggerPetAction()
                        } else {
                            Log.d(TAG, "ACTION_UP — treated as DRAG (dx=$dx, dy=$dy, viewSize=${floatingView.width}x${floatingView.height})")
                        }
                    } else {
                        Log.d(TAG, "ACTION_UP — long press already handled, no-op")
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    // 시스템이 제스처를 가로채는 등 ACTION_UP 없이 끝나는 경우에도 타이머는 반드시 정리.
                    longPressRunnable?.let { handler.removeCallbacks(it) }
                    longPressRunnable = null
                    true
                }
                else -> false
            }
        }

        windowManager.addView(floatingView, params)

        val ivAnim = floatingView.findViewById<android.widget.ImageView>(R.id.iv_pet_anim)
        ivAnim.setBackgroundResource(R.drawable.pet_fly_anim)
        val animDrawable = ivAnim.background as android.graphics.drawable.AnimationDrawable
        animDrawable.start()
    }

    /** MMKV의 luckyyum-pet-store JSON을 읽어 수정 후 다시 쓴다 (updateRunnable의 파싱 패턴과 동일). */
    private fun updatePetStoreState(mutate: (JSONObject) -> Unit) {
        try {
            val mmkv = MMKV.defaultMMKV()
            val petStoreStr = mmkv?.decodeString(PET_STORE_KEY) ?: return
            val jsonObj = JSONObject(petStoreStr)
            if (!jsonObj.has("state")) return
            val state = jsonObj.getJSONObject("state")
            mutate(state)
            mmkv?.encode(PET_STORE_KEY, jsonObj.toString())
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // 11번 섹션(스팸 클릭 방지) 이후 앱 쪽 pet()은 spirit_activeQuest가 'pet'으로 해결되는 퀘스트일
    // 때만 동작한다. 오버레이 탭도 같은 파일 안의 petQuests.json을 그대로 들고 있진 않지만, 최소한
    // "매칭 퀘스트가 떠 있을 때만" 조건은 지켜서 오버레이가 스팸 우회로가 되지 않게 막는다.
    // resolveAction === 'pet'인 퀘스트 id는 app/src/data/petQuests.json 기준 quest-mood-02뿐이다.
    private val PET_RESOLVE_QUEST_IDS = setOf("quest-mood-02")

    /** 쓰다듬기: 'pet' 퀘스트가 떠 있을 때만 intimacy +8, petCount +1. (petStore.ts의 pet() 액션과 동일 규칙) */
    private fun triggerPetAction() {
        updatePetStoreState { state ->
            val activeQuest = state.optJSONObject("spirit_activeQuest")
            val questId = activeQuest?.optString("questId")
            if (questId == null || !PET_RESOLVE_QUEST_IDS.contains(questId)) {
                Log.d(TAG, "triggerPetAction — no matching active 'pet' quest, no-op")
                return@updatePetStoreState
            }
            val intimacy = state.optInt("spirit_intimacy", 50)
            val petCount = state.optInt("petCount", 0)
            state.put("spirit_intimacy", Math.min(100, intimacy + 8))
            state.put("petCount", petCount + 1)
            state.put("spirit_activeQuest", JSONObject.NULL)
        }
        // TODO: 하트 파티클 등 가벼운 네이티브 애니메이션 (향후 작업)
    }

    /** dailyDialogueUsage(date/count/lastDialogueTime)를 검사해 대화 가능 여부 반환. */
    private fun isDialogueBlocked(): Boolean {
        val mmkv = MMKV.defaultMMKV()
        val activityStoreStr = mmkv?.decodeString(ACTIVITY_STORE_KEY) ?: return false
        return try {
            val state = JSONObject(activityStoreStr).optJSONObject("state") ?: return false
            val usage = state.optJSONObject("dailyDialogueUsage") ?: return false

            val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                .format(java.util.Date())
            if (usage.optString("date") != today) return false // 날짜가 다르면 리셋된 것과 동일

            val count = usage.optInt("count", 0)
            val lastDialogueTime = usage.optLong("lastDialogueTime", 0)
            val now = System.currentTimeMillis()

            count >= DAILY_DIALOGUE_LIMIT || (lastDialogueTime > 0 && now - lastDialogueTime < ONE_HOUR_MS)
        } catch (e: Exception) {
            false
        }
    }

    private fun showOverlayMenu() {
        if (menuView != null) {
            Log.d(TAG, "showOverlayMenu — menu already showing, skip")
            return
        }

        val layoutInflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater
        val view = layoutInflater.inflate(R.layout.overlay_menu, null)

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.LEFT

        // 펫 바로 아래, 가로 중앙에 맞춰 띄운다. WRAP_CONTENT라 실제 폭은 addView 전에 미리
        // measure해야 알 수 있다 (안 그러면 펫의 왼쪽 끝에 메뉴 왼쪽 끝이 맞춰져 한쪽으로 치우쳐 보인다).
        view.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        val menuWidth = view.measuredWidth
        val petParams = floatingView.layoutParams as? WindowManager.LayoutParams
        val petCenterX = (petParams?.x ?: 0) + floatingView.width / 2
        params.x = petCenterX - menuWidth / 2
        params.y = (petParams?.y ?: 0) + floatingView.height

        try {
            windowManager.addView(view, params)
            menuView = view
            Log.d(TAG, "showOverlayMenu — menu view added successfully at (${params.x}, ${params.y})")
        } catch (e: Exception) {
            // addView가 여기서 예외를 던지면(권한/토큰 문제 등) 아무 로그 없이 서비스가 죽을 수 있어
            // 반드시 잡아서 로그로 남긴다. 이게 실제 원인이라면 여기서 스택트레이스가 보여야 한다.
            Log.e(TAG, "showOverlayMenu — windowManager.addView FAILED", e)
            return
        }

        view.findViewById<Button>(R.id.btn_talk).setOnClickListener {
            if (isDialogueBlocked()) {
                Toast.makeText(this, "...", Toast.LENGTH_SHORT).show()
            } else {
                launchApp("talk")
            }
            removeOverlayMenu()
        }
        view.findViewById<Button>(R.id.btn_status).setOnClickListener {
            launchApp("status")
            removeOverlayMenu()
        }

        handler.postDelayed({ removeOverlayMenu() }, MENU_AUTO_DISMISS_MS)
    }

    private fun removeOverlayMenu() {
        val view = menuView ?: return
        try {
            windowManager.removeView(view)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        menuView = null
    }

    private fun launchApp(route: String) {
        val intent = Intent(this, MainActivity::class.java)
        intent.putExtra("overlay_route", route)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        startActivity(intent)
    }

    /** 3번 섹션: teen→adult에서 확정된 physical_species가 있으면 그걸, 없으면 이름 해시로 임시 종을 정한다. */
    private fun resolveSpecies(petName: String, lockedSpecies: String?): String {
        if (!lockedSpecies.isNullOrEmpty()) return lockedSpecies
        val speciesIndex = Math.abs(petName.hashCode()) % 3
        return when (speciesIndex) {
            0 -> "fly"
            1 -> "dragon"
            else -> "bear"
        }
    }

    /** 먹는거(이벤트, 10분) > 자는거(밤잠 23~05시 + 낮잠 09~12/14~17시, 총 12시간) > 노는거(정각 6회, 3분씩) > 평소모습. */
    private fun computeVisualState(lastMealTimeMs: Long?): PetVisualState {
        val now = System.currentTimeMillis()
        if (lastMealTimeMs != null && lastMealTimeMs > 0 && now - lastMealTimeMs < EAT_DURATION_MS) {
            return PetVisualState.EAT
        }

        val cal = java.util.Calendar.getInstance()
        val hour = cal.get(java.util.Calendar.HOUR_OF_DAY)
        val minute = cal.get(java.util.Calendar.MINUTE)

        val isNightSleep = hour >= NIGHT_SLEEP_START_HOUR || hour < NIGHT_SLEEP_END_HOUR
        val isNap = NAP_WINDOWS.any { (start, end) -> hour >= start && hour < end }
        if (isNightSleep || isNap) return PetVisualState.SLEEP

        if (PLAY_BURST_HOURS.contains(hour) && minute < PLAY_BURST_DURATION_MIN) return PetVisualState.PLAY

        return PetVisualState.IDLE
    }

    /** eat/play/sleep은 이번에 새로 만든 pet_{species}_{kind}_anim 리소스, egg/memorial은 기존 알 애니메이션. */
    private fun animResourceName(species: String, petStage: String, visualState: PetVisualState): String {
        if (petStage == "egg" || petStage == "memorial") return "pet_egg_${species}_anim"
        return when (visualState) {
            PetVisualState.EAT -> "pet_${species}_eat_anim"
            PetVisualState.SLEEP -> "pet_${species}_sleep_anim"
            PetVisualState.PLAY -> "pet_${species}_play_anim"
            PetVisualState.IDLE -> "pet_${species}_anim"
        }
    }

    private val updateRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return

            try {
                val mmkv = MMKV.defaultMMKV()
                val petStoreStr = mmkv?.decodeString(PET_STORE_KEY)

                if (petStoreStr != null) {
                    val jsonObj = JSONObject(petStoreStr)
                    if (jsonObj.has("state")) {
                        val state = jsonObj.getJSONObject("state")
                        val petName = state.optString("petName", "Unknown")
                        val petTier = state.optInt("petTier", 0)
                        val petStage = state.optString("petStage", "egg")
                        val lockedSpecies: String? = if (state.has("physical_species") && !state.isNull("physical_species")) {
                            state.optString("physical_species")
                        } else null

                        val tvName = floatingView.findViewById<TextView>(R.id.tv_pet_name)
                        tvName.text = "🐾 $petName (Tier: $petTier)"

                        // 11번 섹션: spirit_mealLog의 마지막 급여 시각으로 "먹는거" 상태를 판정한다.
                        val mealLog = state.optJSONArray("spirit_mealLog")
                        val lastMealTime = if (mealLog != null && mealLog.length() > 0) {
                            val t = mealLog.getJSONObject(mealLog.length() - 1).optLong("time", -1L)
                            if (t > 0) t else null
                        } else null

                        val species = resolveSpecies(petName, lockedSpecies)
                        val visualState = computeVisualState(lastMealTime)
                        val resName = animResourceName(species, petStage, visualState)

                        val ivAnim = floatingView.findViewById<android.widget.ImageView>(R.id.iv_pet_anim)
                        val currentTag = ivAnim.tag as? String

                        if (currentTag != resName) {
                            val resId = resources.getIdentifier(resName, "drawable", packageName)
                            if (resId != 0) {
                                ivAnim.setBackgroundResource(resId)
                                val animDrawable = ivAnim.background as android.graphics.drawable.AnimationDrawable
                                animDrawable.start()
                                ivAnim.tag = resName
                            } else {
                                Log.w(TAG, "updateRunnable — missing drawable resource: $resName")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Poll every 1 second
            handler.postDelayed(this, 1000)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        handler.removeCallbacks(updateRunnable)
        longPressRunnable?.let { handler.removeCallbacks(it) }
        removeOverlayMenu()
        if (::floatingView.isInitialized) {
            windowManager.removeView(floatingView)
        }
    }
}
