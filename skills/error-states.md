# 错误状态 Skill

## Error Handling UI

### Error Types
1. **Network Error**: wifi-off icon, "网络连接失败", retry button
2. **API Error**: server icon, message from API, retry + back buttons
3. **Auth Error**: lock icon, "登录已过期", re-login button
4. **Empty Result**: search icon, "未找到结果", adjust search CTA
5. **Compile Error**: alert icon, error message, retry compile

### Error Display
- Toast: transient errors (auto-dismiss)
- Banner: persistent but dismissible
- Inline: form field validation
- Full page: fatal errors

### Error Copy Guidelines
- Friendly, not technical
- Describe what happened
- Suggest next action
- Example: "编译失败：视频字幕获取超时，请检查网络后重试" (not "HTTP 500: asr timeout")

### Retry Pattern
- Show retry count
- Exponential backoff visual indicator
- Max 3 retries, then suggest alternative
