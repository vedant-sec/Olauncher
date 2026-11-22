package app.olauncher.listener

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.Toast
import app.olauncher.R

class DeviceAdmin : DeviceAdminReceiver() {

    companion object {
        fun componentFor(context: Context): ComponentName = ComponentName(context, DeviceAdmin::class.java)
    }

    fun onEnabled(intent: Intent?, context: Context) {
        super.onEnabled(context, intent!!)
        Toast.makeText(context, context.getString(R.string.enabled), Toast.LENGTH_SHORT).show()
    }

    fun onDisabled(intent: Intent?, context: Context) {
        super.onDisabled(context, intent!!)
        Toast.makeText(context, context.getString(R.string.enabled), Toast.LENGTH_SHORT).show()
    }
}