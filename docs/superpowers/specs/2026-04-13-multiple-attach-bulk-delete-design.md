# Multiple Attach Bulk Delete Design

**Goal**

为 `Attach` 字段在 `options=multiple|multi|multiple_files` 的多文件模式下增加与附件侧栏一致的多选一键删除能力，同时继续复用现有 `File` 删除链路和物理文件清理逻辑。

**Scope**

- 覆盖表单中的 `Attach` 多文件字段
- 仅在多文件模式下新增批量删除交互
- 继续复用 `frappe.desk.form.utils.remove_attachments`
- 删除前显示确认弹窗
- 删除时复用 `frappe.show_progress` 显示“正在删除附件”
- 删除成功、部分失败、取消选择等文案保持中文

**Non-Goals**

- 不修改单文件 `Attach` 的现有交互
- 不新增新的后端删除接口
- 不把字段控件重构成与 sidebar 共用的抽象模块

## Current State

附件侧栏已经支持批量删除、中文提示和删除进度框。多文件 `Attach` 字段当前只支持：

- 上传多个文件并把字段值存成 URL JSON 数组
- 展示文件列表
- 单个文件逐条删除
- 清空全部附件

缺少的是字段区域内的“进入选择模式 -> 多选 -> 一键删除”流程。

## Proposed UX

仅当字段处于多文件模式且当前存在文件时，在字段文件列表上方显示批量删除入口。

点击“批量删除”后：

- 文件列表进入选择模式
- 每个文件前展示复选框
- 顶部展示“已选择 N 项”
- 顶部展示“删除”和“取消”按钮
- 原单个“清除”按钮在选择模式下隐藏，避免交互冲突

点击“删除”后：

- 先弹出中文确认提示
- 确认后弹出 `frappe.show_progress("正在删除附件", ...)`
- 调用现有批量删除接口
- 完成后退出选择模式或保留失败项选择状态

## Data Flow

1. 从字段值中解析出当前文件 URL 数组
2. 用 URL 与 `frm.attachments.get_attachments()` 中的 Sidebar 附件记录做匹配
3. 收集选中项对应的 `File.name`
4. 调用 `frappe.desk.form.utils.remove_attachments`
5. 根据返回的 `deleted` / `failed`：
   - 从字段值中移除成功删除的 URL
   - 保留失败 URL
   - 刷新字段 UI
   - 保存表单

## Implementation Plan

### Frontend

在 `frappe/public/js/frappe/form/controls/attach.js` 中扩展多文件模式渲染：

- 为控件增加批量删除模式状态
- 增加已选择项集合
- 在 `render_files()` 中根据状态渲染：
  - 常规列表
  - 选择模式列表
  - 顶部批量操作区
- 增加以下行为方法：
  - 进入选择模式
  - 退出选择模式
  - 切换文件勾选状态
  - 获取选中 URL
  - 将 URL 映射为 Sidebar 附件 `File.name`
  - 执行批量删除并更新字段值

### Backend

后端继续使用已有 `frappe.desk.form.utils.remove_attachments`，不新增 API。

### Tests

扩展 `cypress/integration/control_attach.js`：

- 创建带 `Attach` 字段且 `options=multiple` 的测试表单
- 上传多个附件
- 进入字段选择模式并校验中文按钮/计数
- 执行批量删除并校验进度框
- 校验字段列表与附件数量同步减少

保留现有 sidebar 用例，确保两处能力都存在。

## Error Handling

- 若某个选中 URL 未匹配到 Sidebar 附件记录，则该项视为失败并保留
- 若后端返回部分失败：
  - 字段值仅移除成功项
  - 失败项继续保留并保持已选中
  - 弹出中文错误提示
- 若请求整体失败：
  - 隐藏进度框
  - 保持当前字段值不变
  - 保持选择模式，方便重试

## Risks

- URL 与 `File` 记录匹配规则需要与现有单条删除逻辑保持一致，否则会出现字段值与 Sidebar 记录不同步
- 字段删除后需要保存表单，避免仅删除 `File` 记录而字段 JSON 仍保留旧 URL
- 选择模式与单文件现有“Clear”按钮需要互斥，否则用户容易误触

## Validation

- Python: 现有 `frappe.desk.form.test_form` 继续通过
- Cypress: `sidebar.js` 与 `control_attach.js` 均覆盖批量删除交互
- 手动验证：
  - 多文件字段进入选择模式
  - 勾选多个文件后删除
  - 进度框出现
  - 删除成功后字段值与 Sidebar 附件数一致
