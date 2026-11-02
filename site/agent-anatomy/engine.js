/* Сценарная симуляция устройства агента. Модель и внешние сервисы не вызываются. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AnatomyLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODE = 'scripted-simulation';
  const SCENARIOS = Object.freeze({
    normal: 'Обычный вопрос: установка рабочего редактора',
    unavailable: 'Инструмент поиска не отвечает',
    missing: 'В памятке нет подходящего правила',
    ambiguous: 'В одном вопросе две задачи',
    forbidden: 'Запрошено действие без разрешения',
    limit: 'Разрешён только один шаг',
    meeting: 'Новая задача: бронирование переговорной'
  });
  const RULES = Object.freeze({
    'IT-01': 'Для установки рабочего ПО подайте заявку через сервис-деск и получите согласование руководителя.',
    'IT-02': 'Для восстановления доступа обратитесь в сервис-деск. Не передавайте пароль.'
  });
  const ALLOWED_TOOLS = new Set([
    'search_policy', 'get_sla', 'prepare_draft', 'request_clarification',
    'escalate_to_human', 'search_rooms', 'prepare_booking_draft'
  ]);
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function initialState() {
    return {
      policy: null, responseHours: null, draft: null,
      matches: null, searchErrors: 0, lastError: null,
      clarification: null, stopReason: null, room: null, sent: false
    };
  }

  function taskFor(id, options) {
    if (id === 'missing') return 'Как оформить отпуск?';
    if (id === 'ambiguous') return 'Как установить редактор и восстановить доступ?';
    if (id === 'meeting') return options.taskComplete
      ? 'Подготовь заявку на переговорную на 15:00 для четырёх человек.'
      : 'Помоги забронировать переговорную.';
    return 'Как установить рабочий редактор?';
  }

  // В реальном приложении предложение приходит от модели. Здесь его задаёт сценарий.
  function proposalFor(id, task, state, options) {
    if (id === 'meeting') {
      if (!options.taskComplete) return {
        name: 'request_clarification',
        args: { question: 'На какое время нужна переговорная и сколько будет участников?' },
        description: 'Запросить время встречи и число участников: без этих данных нельзя подобрать комнату.'
      };
      if (!state.room) return {
        name: 'search_rooms', args: { time: '15:00', people: 4 },
        description: 'Найти переговорную, подходящую по времени и вместимости.'
      };
      return {
        name: 'prepare_booking_draft', args: { room: state.room, time: '15:00', people: 4 },
        description: 'Подготовить заявку на найденную комнату. Бронирование требует проверки человека.'
      };
    }
    if (state.draft && id === 'forbidden') return {
      name: 'send_email', args: { draft: state.draft },
      description: 'Ошибочное предложение в учебном сценарии: отправить готовый текст без разрешения.'
    };
    if (state.searchErrors >= 2) return {
      name: 'escalate_to_human', args: { reason: 'search_unavailable' },
      description: 'Сообщить, что поиск дважды не ответил и для продолжения нужна помощь человека.'
    };
    if (state.matches === null) return {
      name: 'search_policy', args: { query: task },
      description: state.searchErrors
        ? 'Один раз повторить поиск после ошибки инструмента.'
        : 'Найти основание ответа в учебной памятке.'
    };
    if (state.matches.length === 0) return {
      name: 'escalate_to_human', args: { reason: 'no_matching_policy' },
      description: 'Сообщить, что в учебной памятке не найдено подходящее правило и нужна помощь сотрудника.'
    };
    if (state.matches.length > 1) return {
      name: 'request_clarification',
      args: { question: 'Что нужно сделать сначала: установить редактор или восстановить доступ?' },
      description: 'Уточнить одну задачу вместо выбора случайного правила.'
    };
    if (state.responseHours === null) {
      const priority = id === 'normal' && options.priority === 'urgent' ? 'urgent' : 'normal';
      return {
        name: 'get_sla', args: { priority },
        description: 'Узнать срок первого ответа на ' + (priority === 'urgent' ? 'срочную' : 'обычную') + ' заявку.'
      };
    }
    return {
      name: 'prepare_draft', args: { policy_id: state.policy },
      description: 'Соединить найденное правило и срок в черновик для проверки человеком.'
    };
  }

  function checkProposal(proposal, state) {
    if (!ALLOWED_TOOLS.has(proposal.name)) return {
      allowed: false, reason: 'tool_not_allowed',
      description: 'Приложение отклонило запрос: отправки сообщений нет в списке разрешённых инструментов. Текст модели не создаёт права.'
    };
    if (proposal.name === 'prepare_draft' &&
        (!RULES[proposal.args.policy_id] || state.policy !== proposal.args.policy_id || state.responseHours === null)) {
      return {
        allowed: false, reason: 'missing_basis',
        description: 'Черновик нельзя подготовить без найденного правила и срока ответа.'
      };
    }
    if (proposal.name === 'prepare_booking_draft' && !state.room) return {
      allowed: false, reason: 'room_not_found',
      description: 'Заявку нельзя подготовить до получения результата поиска комнаты.'
    };
    return {
      allowed: true, reason: 'allowed',
      description: 'Приложение проверило запрос: инструмент разрешён, необходимые данные есть. Можно выполнить действие.'
    };
  }

  function execute(proposal, state, id) {
    switch (proposal.name) {
      case 'search_policy': {
        if (id === 'unavailable') {
          state.searchErrors++;
          state.lastError = 'search_unavailable';
          return {
            execution: 'Приложение вызвало поиск по памятке.',
            observation: 'Инструмент вернул ошибку: сервис поиска недоступен. Мы не знаем, есть ли подходящее правило.',
            status: null
          };
        }
        state.lastError = null;
        state.matches = id === 'missing' ? [] : id === 'ambiguous' ? ['IT-01', 'IT-02'] : ['IT-01'];
        state.policy = state.matches.length === 1 ? state.matches[0] : null;
        return {
          execution: 'Приложение выполнило поиск в учебной памятке.',
          observation: state.matches.length
            ? 'Поиск вернул: ' + state.matches.join(', ') + '. Это данные для выбора следующего шага.'
            : 'Поиск сработал, но не нашёл подходящего правила. Это пустой результат, а не ошибка инструмента.',
          status: null
        };
      }
      case 'get_sla':
        state.responseHours = proposal.args.priority === 'urgent' ? 4 : 24;
        return {
          execution: 'Приложение обратилось к учебной таблице сроков.',
          observation: 'Первый ответ по ' + (proposal.args.priority === 'urgent' ? 'срочной' : 'обычной') +
            ' заявке — в течение ' + state.responseHours + ' часов. Срок решения вопроса здесь не задан.',
          status: null
        };
      case 'prepare_draft':
        state.draft = RULES[state.policy] + ' Срок первого ответа: ' + state.responseHours + ' часа. Источники: ' + state.policy + ', SLA-01. Черновик должен проверить человек.';
        return {
          execution: 'Приложение собрало черновик из найденных данных.',
          observation: 'Черновик подготовлен. Сообщение не отправлено; установка программы не выполнена.',
          status: id === 'forbidden' ? null : 'awaiting_review'
        };
      case 'escalate_to_human':
        state.stopReason = proposal.args.reason;
        return {
          execution: 'Приложение сформировало уведомление о необходимости помощи человека. Реальной отправки нет.',
          observation: proposal.args.reason === 'search_unavailable'
            ? 'Помощник остановился после двух ошибок поиска. Отсутствие правила не установлено.'
            : 'Помощник остановился, потому что поиск не нашёл основания для ответа.',
          status: 'needs_human'
        };
      case 'request_clarification':
        state.clarification = proposal.args.question;
        state.stopReason = id === 'meeting' ? 'missing_meeting_details' : 'multiple_matching_policies';
        return {
          execution: 'Приложение подготовило уточняющий вопрос.',
          observation: state.clarification,
          status: 'needs_input'
        };
      case 'search_rooms':
        state.room = 'Переговорная № 2';
        return {
          execution: 'Приложение проверило вымышленное расписание и вместимость комнат.',
          observation: 'Переговорная № 2 свободна в 15:00 и вмещает четырёх человек. Это ещё не бронирование.',
          status: null
        };
      case 'prepare_booking_draft':
        state.draft = 'Заявка: ' + state.room + ', 15:00, 4 участника. Перед бронированием проверьте данные и подтвердите заявку.';
        return {
          execution: 'Приложение подготовило черновик заявки на переговорную.',
          observation: 'Заявка подготовлена для проверки человеком. Комната не забронирована.',
          status: 'awaiting_review'
        };
      default:
        // Такой путь недоступен при штатной проверке запроса.
        throw new Error('Неразрешённое действие не должно попадать в исполнитель.');
    }
  }

  function runScenario(scenarioId, options) {
    options = options === undefined ? {} : options;
    if (!Object.hasOwn(SCENARIOS, scenarioId)) throw new TypeError('Неизвестный учебный сценарий.');
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Параметры должны быть объектом.');
    const maxSteps = options.maxSteps === undefined ? (scenarioId === 'limit' ? 1 : 8) : options.maxSteps;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 20) throw new RangeError('Разрешите от 1 до 20 шагов.');
    if (options.taskComplete !== undefined && typeof options.taskComplete !== 'boolean') throw new TypeError('taskComplete должен быть логическим значением.');
    if (options.priority !== undefined && !['normal', 'urgent'].includes(options.priority)) throw new TypeError('priority должен быть normal или urgent.');
    const task = taskFor(scenarioId, options);
    const state = initialState();
    const cycles = [];
    let status = 'step_limit';
    for (let step = 0; step < maxSteps; step++) {
      const before = copy(state);
      const proposal = proposalFor(scenarioId, task, state, options);
      const check = checkProposal(proposal, state);
      if (!check.allowed) {
        state.stopReason = check.reason;
        cycles.push({
          tool: proposal.name, proposal, check, execution: null,
          observation: { description: 'В учебный цикл вернулось сообщение об отказе. Отправки не было.' },
          before, after: copy(state)
        });
        status = 'blocked';
        break;
      }
      const outcome = execute(proposal, state, scenarioId);
      cycles.push({
        tool: proposal.name, proposal, check,
        execution: { description: outcome.execution },
        observation: { description: outcome.observation },
        before, after: copy(state)
      });
      if (outcome.status) {
        status = outcome.status;
        break;
      }
    }
    if (status === 'step_limit') state.stopReason = 'step_budget_exhausted';
    return freeze({ scenarioId, task, mode: MODE, cycles, status, sent: false, state: copy(state) });
  }

  function runMeeting(options) {
    options = options === undefined ? {} : options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Параметры должны быть объектом.');
    if (options.equipmentAvailable !== undefined && typeof options.equipmentAvailable !== 'boolean') {
      throw new TypeError('equipmentAvailable должен быть логическим значением.');
    }
    const meetingTools = ['search_rooms', 'prepare_booking_draft', 'escalate_to_human'];
    const allowedTools = options.allowedTools === undefined ? meetingTools : options.allowedTools;
    if (!Array.isArray(allowedTools) || allowedTools.length > meetingTools.length ||
        allowedTools.some(tool => !meetingTools.includes(tool)) || new Set(allowedTools).size !== allowedTools.length) {
      throw new TypeError('allowedTools должен содержать уникальные разрешённые инструменты практикума.');
    }
    const equipmentAvailable = options.equipmentAvailable !== false;
    const criteria = { date: '2026-10-29', time: '15:00', people: 6, projector: true };
    const task = 'Подготовь заявку на переговорную 29 октября 2026 года в 15:00 для шести человек. Нужен проектор.';
    const state = { ...initialState(), rooms: null, selectedRoomId: null, booked: false };
    const cycles = [];
    const finishMeeting = status => freeze({
      scenarioId: 'meeting', task, criteria, allowedTools: copy(allowedTools), mode: MODE,
      cycles, status, sent: false, booked: false, state: copy(state)
    });
    function denyMeeting(proposal) {
      const before = copy(state);
      state.stopReason = 'tool_not_allowed';
      cycles.push({
        tool: proposal.name, proposal,
        check: {
          allowed: false, reason: 'tool_not_allowed',
          description: 'Приложение отклонило запрос: инструмент не включён в выбранный список разрешений.'
        },
        execution: null,
        observation: { description: 'Запрос не выполнен. Измените разрешения или обратитесь к человеку; наличие запроса не даёт права на действие.' },
        before, after: copy(state)
      });
      return finishMeeting('blocked');
    }
    const rooms = [
      { id: 'ROOM-A', name: 'Малая', capacity: 4, projector: true, free: true },
      { id: 'ROOM-B', name: 'Большая', capacity: 8, projector: equipmentAvailable, free: true },
      { id: 'ROOM-C', name: 'Студия', capacity: 10, projector: true, free: false }
    ];
    if (!allowedTools.includes('search_rooms')) return denyMeeting({
      name: 'search_rooms', args: copy(criteria),
      description: 'Проверить комнаты на заданную дату и время: нужны шесть мест и проектор.'
    });
    const beforeSearch = copy(state);
    state.rooms = copy(rooms);
    cycles.push({
      tool: 'search_rooms',
      proposal: {
        name: 'search_rooms', args: copy(criteria),
        description: 'Проверить комнаты на заданную дату и время: нужны шесть мест и проектор.'
      },
      check: { allowed: true, reason: 'allowed', description: 'Поиск комнат разрешён. Дата, время, число участников и оборудование указаны.' },
      execution: { description: 'Приложение прочитало вымышленное расписание и характеристики комнат.' },
      observation: {
        description: rooms.map(room => room.name + ': ' + room.capacity + ' мест, ' +
          (room.projector ? 'есть проектор' : 'нет проектора') + ', ' +
          (room.free ? 'свободна' : 'занята') + '.').join(' ')
      },
      before: beforeSearch, after: copy(state)
    });
    const eligible = rooms.filter(room => room.free && room.capacity >= criteria.people && room.projector);
    let status;
    if (eligible.length) {
      const room = eligible[0];
      if (!allowedTools.includes('prepare_booking_draft')) return denyMeeting({
        name: 'prepare_booking_draft', args: { room_id: room.id, ...copy(criteria) },
        description: 'Предложить комнату «' + room.name + '»: она соответствует всем условиям.'
      });
      const beforeDraft = copy(state);
      state.room = room.name;
      state.selectedRoomId = room.id;
      state.draft = 'Заявка на проверку: переговорная «' + room.name + '», 29.10.2026, 15:00, 6 участников, проектор. Комната ещё не забронирована.';
      cycles.push({
        tool: 'prepare_booking_draft',
        proposal: {
          name: 'prepare_booking_draft', args: { room_id: room.id, ...copy(criteria) },
          description: 'Предложить комнату «' + room.name + '»: она соответствует всем условиям.'
        },
        check: {
          allowed: true, reason: 'allowed',
          description: 'Приложение сверило комнату с результатом поиска: она свободна, вмещает шесть человек и имеет проектор. Подготовка заявки разрешена.'
        },
        execution: { description: 'Приложение подготовило черновик заявки. Запись в расписание не выполнялась.' },
        observation: { description: 'Черновик готов для проверки человеком. Это не подтверждение бронирования.' },
        before: beforeDraft, after: copy(state)
      });
      status = 'awaiting_review';
    } else {
      if (!allowedTools.includes('escalate_to_human')) return denyMeeting({
        name: 'escalate_to_human', args: { reason: 'no_compatible_room' },
        description: 'Сообщить, что подходящей комнаты нет и для продолжения нужна помощь человека.'
      });
      const beforeStop = copy(state);
      state.stopReason = 'no_compatible_room';
      cycles.push({
        tool: 'escalate_to_human',
        proposal: {
          name: 'escalate_to_human', args: { reason: 'no_compatible_room' },
          description: 'Сообщить, что подходящей комнаты нет, и предложить человеку изменить время или требования.'
        },
        check: { allowed: true, reason: 'allowed', description: 'Сообщить о невозможности выполнить задачу разрешено. Игнорировать требования нельзя.' },
        execution: { description: 'Приложение подготовило сообщение об отсутствии подходящей комнаты. Отправки нет.' },
        observation: { description: 'Малая комната не вмещает группу, в Большой нет проектора, Студия занята. Ни одна не подходит по всем условиям.' },
        before: beforeStop, after: copy(state)
      });
      status = 'needs_human';
    }
    return finishMeeting(status);
  }

  return Object.freeze({ MODE, SCENARIOS, runScenario, runMeeting });
});
