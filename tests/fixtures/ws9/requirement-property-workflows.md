> Джерело: https://github.com/solomchaak/property-workflows-spec/issues/39 · оновлено 2026-10-30T07:15:12Z

# Requirement: Assign a vendor and let the vendor work on their own tasks

### Навіщо

Part of the work in a run is done by outside contractors, but today a task can only be given to a manager or an administrator, so the manager has to chase the contractor by phone and mark the task done themselves. After this requirement a manager assigns a vendor to a task when launching a template, the vendor signs in and sees only the runs and tasks that were given to them, marks their own tasks as done, and cannot see or change anything else of the agency, neither on the pages nor by sending a request directly.

### Користувачі й ролі

- Vendor (`vendor`) — an outside contractor: sees only the runs where a task is assigned to them, and in those runs only their own tasks; marks their own tasks as done.
- Manager (`manager`) — as the run manager, assigns a vendor as the assignee of tasks when launching a template, and sees the whole run as before.
- Administrator (`admin`) — creates vendor users, can assign a vendor like a manager, and sees all runs as before.

### Основний сценарій

1. An administrator creates a vendor user; the role `vendor` is set at the moment of creation.
2. A manager launches a template for a case. In the assignee picker the manager sees managers, administrators and vendors by their emails and assigns a vendor as the assignee of some tasks.
3. The vendor signs in and sees the list of runs where they have tasks, each with a record "Your tasks: N of K done".
4. The vendor opens a run and sees only their own tasks: name, section, the mark "required" or "optional" and the status.
5. The vendor marks their task as done. The run manager sees the new status and the progress of the run.

### Критерії приймання

- AC-VENDOR-01: Given manager A, vendor V and the template "Tenant move-in" with 5 tasks. When A launches the template for the case "Apartment 12, move-in" and assigns V as the assignee of tasks 3 and 4. Then tasks 3 and 4 have V as the assignee, and tasks 1, 2 and 5 have A.
- AC-VENDOR-02: Given managers A and B, an administrator and vendor V, and A launching a template. When A opens the assignee picker. Then A sees the emails of B, of the administrator and of V, and no names, roles or other profile data.
- AC-VENDOR-03: Given vendor V who is the assignee of 2 tasks in the run "Apartment 12, move-in" and of no task in the run "Apartment 14, repair". When V opens the list of runs. Then V sees only the run "Apartment 12, move-in" with its run status and "Your tasks: 0 of 2 done", and does not see "Apartment 14, repair".
- AC-VENDOR-04: Given vendor V who is the assignee of tasks 3 and 4 in the run "Apartment 12, move-in" (5 tasks). When V opens this run. Then V sees exactly tasks 3 and 4, each with its name, its section, the mark "required" or "optional" and its status, and does not see tasks 1, 2 and 5, the emails of other users or the progress of the whole run.
- AC-VENDOR-05: Given vendor V who is the assignee of task 3 with status "to do", which is not the last required task of the run "Apartment 12, move-in". When V marks task 3 as done. Then task 3 has status "done", and V sees "Your tasks: 1 of 2 done".
- AC-VENDOR-06: Given the run "Apartment 14, repair" in which vendor V has no task. When V opens the page of this run by a direct link. Then V sees the message "Run not found" and none of the tasks of the run.
- AC-VENDOR-07: Given the run "Apartment 12, move-in" in which task 1 is assigned to manager A and tasks 3 and 4 to vendor V. When V tries to mark task 1 as done directly, bypassing the pages of the application. Then task 1 stays "to do".
- AC-VENDOR-08: Given vendor V signed in. When V opens the list of templates by a direct link. Then V sees the message "Not enough rights" and no template.
- AC-VENDOR-09: Given vendor V signed in and the template "Tenant move-in" with current version 1. When V tries to launch this template directly, bypassing the pages of the application. Then no run is created, and the list of runs does not change.
- AC-VENDOR-10: Given vendor V to whom no task is assigned. When V opens the list of runs. Then V sees the message "No tasks assigned to you yet." and no empty table.

### Поза межами

- A vendor accepting or declining a task, a visit date, and returning a declined task to the manager.
- Uploading estimates, photos and invoices by a vendor.
- Assigning or changing a vendor after the run is launched: assignees are set only at launch.
- Invitation links, guest access without an account, and notifications to vendors.
- A directory of vendors synchronised with an accounting system: vendors are created by the administrator, in the training project as initial data.
- A vendor launching templates, editing templates, or seeing other users, templates, versions or runs of other vendors.

### Припущення

- Users with the role `vendor` are created by the administrator, who chooses the role at the moment of creation; in the training project they are prepared as initial data. A vendor signs in with an email and a password like any other user. A user without a role does not exist.
- A vendor can be the assignee of any task, but never the run manager of a run.
- "Your tasks: N of K done" counts only the tasks assigned to this vendor in this run, K being their number and N those with status "done".
- Marking the last required task of a run as done asks for confirmation also for a vendor, with the notice "This cannot be undone", as in "Requirement: Complete tasks and track run progress".
- A vendor sees in a run only the name, the section, the mark "required" or "optional" and the status of their own tasks; the case name and the run status are shown in the list of runs.
- Every limit in the rights matrix of the Product is enforced for direct requests too: a request that a role is not allowed to make is refused, changes nothing and discloses nothing.
- The interface is in English: messages and statuses are shown exactly as written in the acceptance criteria and in the glossary.
- All dates and times in the application are shown in Kyiv time; this requirement has no time rules.
- The data is for training: object names and users are fictional (`*@example.test`).

### Відкриті питання

Немає.

### Журнал змін

- 2026-10-30 — created
