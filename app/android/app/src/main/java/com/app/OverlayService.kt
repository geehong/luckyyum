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

    private lateinit var windowManager: WindowManager
    private lateinit var floatingView: View
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    // 롱프레스 메뉴(overlay_menu.xml)용 별도 오버레이 뷰. null이면 표시 중이 아님.
    private var menuView: View? = null
    private var longPressRunnable: Runnable? = null
    private var isLongPressTriggered = false

    private val LONG_PRESS_MS = 2000L
    private val TOUCH_SLOP_PX = 20
    private val MENU_AUTO_DISMISS_MS = 3000L
    private val ONE_HOUR_MS = 60 * 60 * 1000L
    private val DAILY_DIALOGUE_LIMIT = 5

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

                    longPressRunnable = Runnable {
                        isLongPressTriggered = true
                        showOverlayMenu()
                    }
                    handler.postDelayed(longPressRunnable!!, LONG_PRESS_MS)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()

                    // 일정 거리 이상 움직이면 롱프레스는 취소 (일반적인 터치 시맨틱과 동일)
                    if ((Math.abs(dx) > TOUCH_SLOP_PX || Math.abs(dy) > TOUCH_SLOP_PX) && longPressRunnable != null) {
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
                            params.x = initialX
                            params.y = initialY
                            windowManager.updateViewLayout(floatingView, params)
                            triggerPetAction()
                        }
                    }
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

    /** MMKV의 user-storage JSON을 읽어 수정 후 다시 쓴다 (updateRunnable의 파싱 패턴과 동일). */
    private fun updateUserStorageState(mutate: (JSONObject) -> Unit) {
        try {
            val mmkv = MMKV.defaultMMKV()
            val userStorageStr = mmkv?.decodeString("user-storage") ?: return
            val jsonObj = JSONObject(userStorageStr)
            if (!jsonObj.has("state")) return
            val state = jsonObj.getJSONObject("state")
            mutate(state)
            mmkv?.encode("user-storage", jsonObj.toString())
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /** 쓰다듬기: intimacy +5(상한 100), petCount +1. (userStore.ts의 pet() 액션과 동일 규칙) */
    private fun triggerPetAction() {
        updateUserStorageState { state ->
            val intimacy = state.optInt("intimacy", 50)
            val petCount = state.optInt("petCount", 0)
            state.put("intimacy", Math.min(100, intimacy + 5))
            state.put("petCount", petCount + 1)
        }
        // TODO: 하트 파티클 등 가벼운 네이티브 애니메이션 (향후 작업)
    }

    /** dailyDialogueUsage(date/count/lastDialogueTime)를 검사해 대화 가능 여부 반환. */
    private fun isDialogueBlocked(): Boolean {
        val mmkv = MMKV.defaultMMKV()
        val userStorageStr = mmkv?.decodeString("user-storage") ?: return false
        return try {
            val state = JSONObject(userStorageStr).optJSONObject("state") ?: return false
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
        if (menuView != null) return

        val layoutInflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater
        val view = layoutInflater.inflate(R.layout.overlay_menu, null)
        menuView = view

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
        // 펫 바로 아래에 메뉴를 띄운다.
        val petParams = floatingView.layoutParams as? WindowManager.LayoutParams
        params.x = petParams?.x ?: 0
        params.y = (petParams?.y ?: 0) + floatingView.height

        windowManager.addView(view, params)

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

    private val updateRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return

            try {
                val mmkv = MMKV.defaultMMKV()
                val userStorageStr = mmkv?.decodeString("user-storage")

                if (userStorageStr != null) {
                    val jsonObj = JSONObject(userStorageStr)
                    if (jsonObj.has("state")) {
                        val state = jsonObj.getJSONObject("state")
                        val petName = state.optString("petName", "Unknown")
                        val petTier = state.optInt("petTier", 0)
                        val petStage = state.optString("petStage", "egg")

                        val tvName = floatingView.findViewById<TextView>(R.id.tv_pet_name)
                        tvName.text = "🐾 $petName (Tier: $petTier)"

                        val ivAnim = floatingView.findViewById<android.widget.ImageView>(R.id.iv_pet_anim)
                        val currentTag = ivAnim.tag as? String
                        val newTag = "${petName}_${petStage}"

                        if (currentTag != newTag) {
                            val speciesIndex = Math.abs(petName.hashCode()) % 3

                            val animRes = if (petStage == "egg" || petStage == "memorial") {
                                when (speciesIndex) {
                                    0 -> R.drawable.pet_egg_fly_anim
                                    1 -> R.drawable.pet_egg_dragon_anim
                                    else -> R.drawable.pet_egg_bear_anim
                                }
                            } else {
                                when (speciesIndex) {
                                    0 -> R.drawable.pet_fly_anim
                                    1 -> R.drawable.pet_dragon_anim
                                    else -> R.drawable.pet_bear_anim
                                }
                            }

                            ivAnim.setBackgroundResource(animRes)
                            val animDrawable = ivAnim.background as android.graphics.drawable.AnimationDrawable
                            animDrawable.start()
                            ivAnim.tag = newTag
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
